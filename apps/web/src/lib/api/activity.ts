import type { OrganizationActivityListResponse } from "@knowledgehub/shared-types";
import { apiFetch } from "./client";

export const activityApi = {
  list(
    organizationId: string,
    options: {
      cursor?: string;
      limit?: number;
      action?: string;
      actorId?: string;
      from?: string;
      to?: string;
    } = {},
  ): Promise<OrganizationActivityListResponse> {
    const params = new URLSearchParams();
    if (options.cursor) params.set("cursor", options.cursor);
    if (options.limit !== undefined) params.set("limit", String(options.limit));
    for (const key of ["action", "actorId", "from", "to"] as const) {
      if (options[key]) params.set(key, options[key]);
    }
    const query = params.toString();
    return apiFetch<OrganizationActivityListResponse>(
      `/organizations/${organizationId}/activity${query ? `?${query}` : ""}`,
      { authRecovery: true },
    );
  },
};
