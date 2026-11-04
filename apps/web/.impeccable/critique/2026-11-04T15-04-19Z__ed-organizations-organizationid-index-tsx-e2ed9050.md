---
target: org overview admin page
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/hectorburuca/projects/knowledgehub-ai/apps/web/src/routes/_authenticated/organizations.$organizationId.index.tsx"
target_fingerprint: "sha256:c7b4d22e65a466bfc6dde5c2c9c5e4af28d38454b803be572364efab6ac624af"
target_path: /Users/hectorburuca/projects/knowledgehub-ai/apps/web/src/routes/_authenticated/organizations.$organizationId.index.tsx
timestamp: 2026-11-04T15-04-19Z
slug: ed-organizations-organizationid-index-tsx-e2ed9050
---
Method: dual-agent, source-only.
Org overview (Operate) 21/40. P1 role select commits instantly incl. promote to Owner; one pending mutation disables every row. P1 overview is mostly member admin; description promises documents/usage. P2 add-vs-invite outcome hidden, inviteRole persists, validation via toast. P2 pending invites lack role badge, revoke has no confirm. P3 checklist aria-label on span, usage bar NaN at limit 0, aria-valuemax mismatch, double setDismissedKey.
