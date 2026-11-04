# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Small and mid-sized teams (operations, support, legal, consulting) whose knowledge is spread across internal documents and who need answers they can verify.
- Recruiters and technical evaluators reviewing KnowledgeHub AI as a portfolio project. The public pages must read as a real, finished product to them.

## Product Purpose

KnowledgeHub AI is a multi-tenant RAG workspace. A team creates an organization, uploads its documents, and asks questions in plain language. Every answer cites the passages it was built from, so the reader can open the source and check it. Success means a team trusts an answer because it can trace it.

## Positioning

Answers are only as good as the evidence behind them: KnowledgeHub AI shows the exact passage and page each sentence came from, and refuses to answer when the evidence is insufficient. Tenant isolation is enforced on every request, not promised.

## Operating Context

- Documents: PDF, Word (.docx), Markdown, and plain text, up to 25 MB each.
- Workspaces are organizations with Owner, Admin, Member, and Viewer roles.
- A demo workspace named Northwind Labs exists behind `VITE_DEMO_ENABLED`; its sample documents are synthetic.
- Interface is localized in English and Spanish.

## Capabilities and Constraints

- Cited answers with links to source passages; insufficient-evidence answers instead of guesses.
- Hybrid search combining semantic and keyword matching.
- Collections to group documents and scope questions to them.
- Conversations are private by default and can be shared with the organization.
- Insights for admins: questions asked, unanswered questions, and answer feedback.
- Audit log of membership and document changes for Admins and Owners.
- Daily answer limit per organization, reset at midnight UTC.
- Pricing: a Free plan at $0. Team and Enterprise plans are not available yet; visitors can join a waitlist by email.
- Generation sends retrieved passages to OpenAI.

## Brand Commitments

- Name: KnowledgeHub AI.
- The marketing pages (`/` and `/security`) use a black and white product look with the same blue accent as the admin app (`--primary`/`--brand`); no green. The authenticated app keeps its own interface.

## Evidence on Hand

- Real product screenshots exist on the open PR #99 branch (`fix/landing-skeleton`, `apps/web/public/landing/`).
- No customers, testimonials, usage metrics, benchmarks, or press exist. Never invent them.

## Product Principles

1. Show the evidence: every claim on a public page should be demonstrable in the product.
2. Trust is earned by traceability, not by adjectives.
3. Isolation and permissions are product features, stated precisely.
4. Keep the public story honest about what is still on the way.
