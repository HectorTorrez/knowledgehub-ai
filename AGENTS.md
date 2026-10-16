<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# KnowledgeHub AI

This section is project-specific and authoritative. It lives outside the Turborepo-managed block above and is not overwritten by it.

## Architecture

- `apps/web` is the TanStack Start frontend.
- `apps/api` is the NestJS backend.
- The frontend and backend communicate through HTTP APIs.
- Business logic belongs in the backend.
- Do not use TanStack Start server functions or API routes.
- Frontend code must not access the database directly.
- Never trust client-provided organization IDs without verifying the user's membership.
- Organization data must be isolated across tenants.
- Do not expose internal database models as public API contracts by default.

## Engineering practices

- Prefer simple, maintainable solutions over unnecessary abstractions.
- Follow Clean Architecture principles pragmatically.
- Keep business logic independent of frameworks and infrastructure where appropriate.
- Add tests for important business rules and security-sensitive behavior.
- Never commit secrets or real environment credentials.
- Explain architectural trade-offs before introducing significant complexity.
- Do not scaffold unrelated features or proceed beyond the requested task.

## Comments

- Comments are banned by default. This codebase treats a comment as a red flag: agents reach for prose to justify a workaround, a bandaid, or an unhandled edge instead of fixing the root cause. Do not add one.
- A comment that explains our own code is a confession that the code is not obvious. Make the code obvious instead: rename, extract a well-named function, encode the case in a type, or restructure so the behavior reads from the code. Then delete the comment.
- Write zero narration, banner, or section-separator comments and never leave commented-out code.
- A comment survives only when it records something we cannot change or express in code:
  - the public API contract a type or endpoint exposes;
  - non-obvious behavior forced by an external dependency, platform, vendor, or protocol;
  - a linked issue or RFC, or a legal/license header.
- Functional directives (`eslint-disable`, `@ts-nocheck`, `/// <reference>`) and generated-file headers are exempt. A suppression that masks a bug or a correctness/safety hazard is not exempt: remove it and fix the cause.
- When a needed comment hides a workaround in our own code, the work is to remove the workaround, not to word the comment better.
