# KnowledgeHub AI

**Your team's documents, ready to answer questions.**

KnowledgeHub AI is a shared workspace for turning documents into searchable knowledge. Upload your files, ask questions in plain language, and explore answers alongside citations that lead back to their sources.

## From documents to answers

1. **Bring your knowledge together.** Upload PDFs, Word documents, text, and Markdown to an organization workspace.
2. **Find what matters.** Search your documents or ask a question across your workspace or within a specific document.
3. **Follow the sources.** Review cited passages and page references as you explore an answer. When there isn't enough evidence, KnowledgeHub can say so.
4. **Work as a team.** Invite teammates, manage membership and roles, and keep each organization's documents scoped to its members.

Document processing also produces summaries, and conversations let you ask follow-up questions. KnowledgeHub is a portfolio project; generated answers can still be wrong, so check the cited material before relying on them.

## Try the demo locally

The seeded workspace includes fictional teammates and sample documents. You'll need Node.js 24, pnpm 11, Docker with Compose, and an OpenAI API key to process documents and generate answers.

```bash
corepack enable
pnpm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
```

In `apps/api/.env`, replace the example `JWT_ACCESS_SECRET` and `CSRF_SECRET` with unique values of at least 32 characters. Set `OPENAI_API_KEY`, `PROCESSING_WORKER_ENABLED=true`, and `ANSWERS_ENABLED=true`. The example database and storage settings match the local Compose services; keep them aligned if you change them.

```bash
pnpm db:up
pnpm storage:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open [localhost:3000](http://localhost:3000) and use the demo button on the login page, or sign in with:

| Email | Password |
| --- | --- |
| `demo@knowledgehub.ai` | `DemoKnowledge2026!` |

The seed uploads sample documents and queues them for processing. They become searchable once the worker processes them. See the [development reference](DEVELOPMENT.md) for configuration, troubleshooting, and testing details.

## Built for a shared workspace

KnowledgeHub uses a TanStack Start frontend and a NestJS API in a pnpm monorepo. The API owns business logic and data access, with PostgreSQL and pgvector for data and retrieval, and S3-compatible storage for documents. Local development uses MinIO; document processing and AI features use configured providers.

Organization membership is checked by the backend on tenant requests. Questions and selected document content are sent to the configured AI provider for retrieval and answer generation. Citations help readers inspect sources, but citation validation does not guarantee factual accuracy.

## For developers

- [Development and API reference](DEVELOPMENT.md) — setup, configuration, endpoints, processing, evaluation, and operational details.
- [Environment configuration](apps/api/.env.example) — API settings and defaults.

Run `pnpm lint`, `pnpm check-types`, `pnpm test`, and `pnpm build` for the main quality checks.
