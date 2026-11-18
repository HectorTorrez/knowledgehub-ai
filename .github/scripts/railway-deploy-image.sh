#!/usr/bin/env bash
set -euo pipefail

service_id="$1"
image="$2"
api_url="https://backboard.railway.com/graphql/v2"
deadline=$((SECONDS + 900))

: "${RAILWAY_TOKEN:?RAILWAY_TOKEN is required}"
: "${RAILWAY_ENVIRONMENT_ID:?RAILWAY_ENVIRONMENT_ID is required}"

graphql() {
  local response
  response=$(curl --fail-with-body --silent --show-error "$api_url" \
    --header "Project-Access-Token: $RAILWAY_TOKEN" \
    --header 'Content-Type: application/json' \
    --data "$(jq --null-input --arg query "$1" --argjson variables "$2" \
      '{query: $query, variables: $variables}')")

  if jq --exit-status '.errors' <<<"$response" >/dev/null; then
    echo "Railway API error: $(jq --compact-output '.errors' <<<"$response")" >&2
    exit 1
  fi

  echo "$response"
}

if ! docker manifest inspect "$image" >/dev/null 2>&1; then
  echo "Railway cannot pull $image anonymously. Make the GHCR package public." >&2
  exit 1
fi

variables=$(jq --null-input \
  --arg service "$service_id" \
  --arg environment "$RAILWAY_ENVIRONMENT_ID" \
  --arg image "$image" \
  '{service: $service, environment: $environment, image: $image}')

graphql 'mutation ($service: String!, $environment: String!, $image: String!) {
  serviceInstanceUpdate(serviceId: $service, environmentId: $environment, input: { source: { image: $image } })
}' "$variables" >/dev/null

deployment_id=$(graphql 'mutation ($service: String!, $environment: String!) {
  serviceInstanceDeployV2(serviceId: $service, environmentId: $environment)
}' "$variables" | jq --raw-output '.data.serviceInstanceDeployV2')

echo "Deploying $image as deployment $deployment_id"

while ((SECONDS < deadline)); do
  status=$(graphql 'query ($id: String!) { deployment(id: $id) { status } }' \
    "$(jq --null-input --arg id "$deployment_id" '{id: $id}')" |
    jq --raw-output '.data.deployment.status')

  case "$status" in
    SUCCESS | SLEEPING)
      echo "Deployment $deployment_id is live ($status)"
      exit 0
      ;;
    FAILED | CRASHED | REMOVED | SKIPPED)
      echo "Deployment $deployment_id ended as $status" >&2
      exit 1
      ;;
  esac

  sleep 5
done

echo "Deployment $deployment_id did not finish within 15 minutes" >&2
exit 1
