# KH-10 — Contract facts and deterministic totals (design for review)

Status: **Implemented (phases 1–5).** This document designed the only path that
produces a trustworthy answer to "sumá los montos totales": a structured fact
extracted at ingestion, deduplicated by contract identity, and summed by the
database. It also records why the cheaper options were rejected, with
measurements from the local corpus.

## 1. Problem

`POST /organizations/:id/answers` answers from an organization's document chunks.
A question that asks for a **total** cannot be answered by that pipeline, and the
current refusal is correct rather than a bug:

- Retrieval returns the top `ANSWER_MAX_SOURCES` (8) chunks by cosine similarity
  (`retrieval.service.ts:54-108`).
- A claim must cite exactly **one** integer source (`answer-citation.ts:119-135`),
  and the prompt forbids stating anything a single source does not state
  (`answer-prompt.ts:26-29`). A sum is derived from many sources, so it is not
  representable.
- Chunks overlap by `CHUNK_OVERLAP_CHARACTERS` (320) inside a 1,600-character
  window (`chunking.policy.ts:1-5,71`), so the same table row appears in two
  chunks. Even if arithmetic were allowed, summing the retrieved text
  double-counts rows.

## 2. Measured evidence (local corpus, 2026-10-21)

Method: the production retrieval SQL from `retrieval.service.ts` against the
seeded organization, with query embeddings from the configured
`text-embedding-3-small` (1,536 dimensions). Contract rows were parsed from the
11 chunks by a throwaway regex, so the absolute figures are estimates; the
relationship between them is the point.

Document: *Total Contracts Detail Apr 8 2026*, 4 pages, 11 chunks, one contract
per row, 4 chunks carry the `Monto Total` header.

| Scenario | Contracts in context | Sum |
| --- | --- | --- |
| Top-8 chunks for "dame la suma de montos totales" | 75 of 105 | $74,122.47 |
| All 11 chunks (naive sum) | 105 of 105 | $106,174.21 |
| All 11 chunks, deduplicated by contract id | 105 of 105 | **$98,346.21** |

Ranking for the failing question (all above the 0.2 floor):

| chunk | similarity | header row |
| --- | --- | --- |
| 0 | 0.3808 | yes |
| 2 | 0.3426 | no |
| 1 | 0.3403 | no |
| 3 | 0.3344 | yes |
| 10 | 0.3303 | yes |
| 7 | 0.3260 | yes |
| 6 | 0.3108 | no |
| 4 | 0.2929 | no |

Three conclusions drive the design:

1. **Recall is not the blocker.** All four total-bearing chunks rank in the top 8.
   Raising `ANSWER_MAX_SOURCES` or lowering `ANSWER_MIN_SIMILARITY` does not make
   the refusal go away, and it would inflate the context a model is tempted to
   add up.
2. **The blocker is structural.** One claim, one source, cannot express a derived
   value.
3. **Chunk overlap makes text-level arithmetic wrong by +7.9%.** A "multi-source
   claim" feature would let the model emit $106,174.21 with perfect citations.

## 3. Decision

Build D. Reject A and C, and treat B as copy, not architecture.

| Option | Verdict | Reason |
| --- | --- | --- |
| A. Tune `ANSWER_MAX_SOURCES` / similarity | Reject | Retrieval already returns every relevant chunk; more context only widens the wrong-sum surface. |
| B. New `partial` answer status | Reject for now | Without a count of contracts in scope, "partial" can only say "I cannot guarantee a total" — which is what the refusal already says. It changes the public answer contract for a sentence. |
| C. Claims with multiple sources | Reject | Produces a confident, cited, double-counted total. Worse than refusing. |
| D. Structured facts + deterministic sum | **Adopt** | Complete, deduplicated, auditable per contract, and independent of the completion model for the arithmetic. |

The one immediate improvement that is honest and nearly free is copy: the
refusal should tell the user a total is not derivable from retrieved passages and
offer the breakdown. That is a frontend string change, tracked separately from
this design.

## 4. Design

### 4.1 Data model

New table, owned by the ingestion pipeline and read by aggregation:

```prisma
model DocumentFact {
  id                 String   @id @default(uuid()) @db.Uuid
  organizationId     String   @db.Uuid
  documentId         String   @db.Uuid
  documentGeneration Int
  factType           FactType
  naturalKey         String
  label              String
  amountMinor        BigInt
  scale              Int      @default(2)
  currency           String   @db.Char(3)
  pageNumber         Int
  chunkIndex         Int?
  evidenceText       String
  extractedAt        DateTime @default(now())

  document Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([documentId, documentGeneration, factType, naturalKey])
  @@index([organizationId, factType, currency])
  @@index([organizationId, documentId, documentGeneration])
}

enum FactType {
  CONTRACT_TOTAL
}
```

- `amountMinor` is an integer in minor units (500.00 → 50000), parsed by the
  server. Money never touches a float.
- `currency` is an ISO 4217 code. The extractor proposes it; the server validates
  it against an allow-list. A fact with an unknown currency is rejected, not
  guessed.
- `naturalKey` is the contract identifier from the row. The unique constraint is
  the deduplication mechanism: the same contract extracted twice (page overlap or
  a retried job) collapses to one row.
- `chunkIndex` is resolved server-side by finding the chunk on `pageNumber` whose
  content contains `evidenceText`; it exists so a fact can produce the same
  citation shape as an answer (`documentId`, `pageNumber`, `chunkIndex`,
  `excerpt`). A fact whose evidence no chunk contains keeps a null index; the
  amount still counts and the citation falls back to the page.
- `scale` is the currency's decimal places at extraction time, so the client
  formats without re-deriving currency rules.

### 4.2 Extraction phase

Placement: after chunking succeeds, before the document becomes `READY`.

Before extracting, the document is classified: unless at least one page names a
contract total column (`Monto Total`, `Total`, `Total del contrato`, `Contract
total`), it is stored with zero facts and `READY`. This keeps shipment logs and
invoices from leaking into contract totals.

1. Read the current generation's pages from `DocumentExtraction` — not chunks.
   Overlap exists only in chunks, so reading pages removes the duplicate source
   before extraction.
2. Extract one page at a time. Rows that span a page boundary are not repaired;
   the coverage check below catches the resulting shortfall rather than hiding it.
3. Send a strict JSON schema (`contractId`, `label`, `amountText`, `currency`,
   `evidenceText`). The model returns the **raw text** of the row and the amount
   as written; the server reparses `amountText` and verifies `evidenceText` occurs
   verbatim in the page. The model never supplies the numeric value that gets
   summed.
4. Validate: amount parses, currency allowed, `contractId` non-empty after
   normalization, `evidenceText` ≤ 500 characters. Invalid facts are dropped and
   counted; a page with zero valid facts where the model claimed rows is a
   failure, not an empty result.
5. **Coverage check.** Tokenize every money amount printed on the page and require
   each one to fall inside the evidence span of an extracted row. A plan name that
   mentions a price is covered by its own row. If a token is uncovered, retry the
   page once with the surrounding text as a hint; if it is still uncovered, keep
   the facts and publish the document as `FAILED` with
   `FactCoverageIncomplete`.
6. Replace all facts for the generation in a transaction guarded by the document's
   current generation — stale generations must not write facts, exactly like
   `DocumentChunkStore.replaceForGeneration`.

Failure policy: fact extraction never fails the document. It sets
`Document.factsStatus` to `READY`, `FAILED`, or `PENDING` and records an error
class, never provider payloads. A transient provider failure leaves the document
`PENDING` so the backfill retries it; a content failure marks it `FAILED`.
A failed extraction is visible to aggregation as missing coverage.

### 4.3 Coverage semantics

The dangerous outcome is not a refusal; it is a total that silently omits
documents or rows. Coverage is therefore part of the contract:

- Scope = the organization's `READY` documents, optionally narrowed by
  `documentId`.
- `complete` only when **every** document in scope has `factsStatus = READY`.
- Otherwise `partial`, with counts: documents in scope, extracted, failed, and
  pending. The facts of a `FAILED` document still contribute, so a partial total
  is a labeled lower bound, never a silently short number.

### 4.4 Aggregation

New read module (`apps/api/src/aggregation/`) following the existing
port/service shape:

```
GET /organizations/:organizationId/aggregates/contract-totals
    ?documentId=<uuid>&currency=USD
```

```json
{
  "status": "complete",
  "coverage": { "documents": 1, "extracted": 1, "failed": 0, "pending": 0 },
  "collapsedDuplicates": 0,
  "totalFacts": 110,
  "totals": [
    { "currency": "USD", "scale": 2, "totalMinor": "10280749", "contractCount": 110 }
  ],
  "breakdown": [
    {
      "contractId": "1143",
      "label": "Plan Personalizado",
      "amountMinor": "50000",
      "currency": "USD",
      "scale": 2,
      "documentId": "…",
      "documentTitle": "Total Contracts Detail",
      "pageNumber": 1,
      "chunkIndex": 0,
      "excerpt": "1143 Plan Personalizado … $500.00 …"
    }
  ]
}
```

Rules:

- `BigInt` crosses JSON as a string; the client formats it with the currency and
  the returned `scale`.
- **No cross-currency sums.** `totals` carries one block per currency in scope;
  conversion is explicitly out of scope.
- **Cross-document duplicates**: when the same `naturalKey` appears in more than
  one document in scope, the newest document wins and `collapsedDuplicates`
  reports how many were collapsed. This is a policy default, not an accident.
- Tenancy: `organizationId` is part of every query and every index; a document
  from another organization is a `404` exactly as in the answers endpoints.
- `breakdown` is paginated (`limit` 1–200, default 50; `offset`), while `totals`
  and `totalFacts` always cover the full scope.

### 4.5 Answer pipeline

Two phases, deliberately separated:

**Phase 1 (implemented).** The aggregate endpoint is called by the document page
from an explicit action ("Calculate total"), not by intent detection. This ships
value without touching the answer contract, and it gives a deterministic target.

**Phase 2 (implemented).** `AnswersService` checks for an aggregate cue before
retrieval. When it matches and the scope has facts, it returns a server-rendered
`answered` response with one sentence per currency and one citation per
contributing document. The completion model, the embedding call and the answer
quota are skipped. A specific record question ("total of contract 1143") is
excluded by a record-id guard, and a scope with zero facts falls back to the
normal pipeline. The response contract is unchanged: the answer is a normal
`answered` payload with citations.

## 5. Migration and backfill

1. Migration adds `DocumentFact`, `FactType`, `FactsStatus`, and
   `Document.factsStatus` (default `PENDING`).
2. A backfill job extracts facts for existing `READY` documents, in document
   order, idempotent per generation, with a bounded concurrency and a per-document
   timeout. It is safe to stop and resume: `PENDING` is the work queue.
3. Until a document is backfilled it reports `PENDING`, so any total that includes
   it is `partial` — never silently short.

## 6. Configuration

Following the existing validation layer:

| Variable | Default | Meaning |
| --- | --- | --- |
| `FACTS_ENABLED` | `false` | Runs extraction during processing and mounts the aggregate endpoint. |
| `FACTS_MODEL` | `ANSWER_MODEL` | Completion model for extraction. |
| `FACTS_MAX_INPUT_CHARS` | `20000` | Page window sent per extraction call. |
| `FACTS_MAX_OUTPUT_TOKENS` | `4000` | Cap for one extraction call. |
| `FACTS_TIMEOUT_MS` | `60000` | Timeout for one extraction call. |
| `FACTS_CURRENCIES` | `USD` | Allow-list of ISO codes. |
| `FACTS_BACKFILL_BATCH` | `5` | Documents per backfill batch. |

No new secret: extraction reuses the configured completion provider.

## 7. Testing

Unit:

- Amount parsing: `$1,084.80` → `108480`; `$7.00`; thousands separators; a
  negative credit note; a missing currency; a malformed amount.
- Evidence validation: `evidenceText` absent from the page is rejected.
- Dedupe: the same contract in two overlapping pages yields one row; a retried
  job replaces, never appends; a stale generation writes nothing.
- Coverage: `PENDING`/`FAILED` documents force `partial`.
- Aggregation SQL: sum, counts, currency partition, cross-document collapse,
  empty scope, pagination.
- Tenancy: facts from another organization are invisible; a foreign
  `documentId` is `404`.

Integration (existing real-provider harness):

- Seed a document with a known contract table; assert the exact total, the
  contract count, and `status: "complete"`.
- Add the question "¿cuál es la suma de los montos totales?" to the evaluation
  set. Expected: either the exact total from the aggregate path or an explicit
  refusal — never a number from the completion model.
- A regression fixture for the overlap case: two chunks whose boundary repeats a
  row must not double-count.

## 8. Risks and trade-offs

| Risk | Mitigation |
| --- | --- |
| Extraction quality varies with table layout | Server re-parses amounts from evidence; rejects facts whose evidence is not verbatim; coverage exposes failures instead of hiding them. |
| Scanned PDFs have no text | Out of scope (OCR is KH-9.8); those documents stay `FAILED` and force `partial`. |
| Ingestion cost and latency rise | Extraction is one extra bounded call per page window; `FACTS_ENABLED` gates it; processing is already asynchronous. |
| Cross-document duplicate policy is a guess | Default is newest-wins with `collapsedDuplicates` reported; can become an explicit parameter once real corpora show the pattern. |
| A new table and status widen the schema | Additive only; no existing column changes; `factsStatus` defaults to `PENDING`, which fails closed. |

Accepted trade-off: totals are a first-class question type for a contract
repository, so one table, one extraction call, and one endpoint are justified. A
prompt or schema tweak cannot deliver a correct total, and a wrong total is worse
than the current refusal.

## 9. Open questions and proposed defaults

| # | Question | Proposed default |
| --- | --- | --- |
| Q1 | Which column is "the total" when a document has several money columns? | The extractor returns every labeled amount column; only `monto total` / `total` maps to `CONTRACT_TOTAL`. Others are stored as future fact types. |
| Q2 | Does "total" include taxes? | Whatever the row's total column states; the fact never recomputes tax. |
| Q3 | Sum within one document or across the organization? | The endpoint defaults to the whole organization, deduplicated by contract id, and accepts `documentId`. |
| Q4 | Are contract ids globally unique? | Assume unique within an organization; collapse by `naturalKey`, report collisions. |
| Q5 | Multi-currency scope? | Per-currency blocks, no conversion. |

## 10. Implementation phases

1. **Schema + parser + aggregation endpoint** — `DocumentFact`, amount parsing,
   coverage, dedupe, tenancy; tested with unit tests.
2. **Extraction phase** — strict schema, server-side reparse and evidence check,
   money-token coverage with one hinted retry, `factsStatus` in the lifecycle.
3. **Backfill** — in-process batches for `READY` documents still `PENDING`.
4. **UI** — "Calculate total" on the document page, coverage banner, per-contract
   breakdown.
5. **Answer integration** — aggregate cue in `AnswersService`, server-rendered
   answer with per-document citations, no provider or quota use.

Live verification on the local corpus: 4 pages, 110 contract rows, total
`$102,807.49`, matching an independent regex count of the same table. The first
pass missed one `$406.80` row; the coverage check flagged it, and the prompt
correction ("never merge rows with the same client or amount") recovered it.
The ask flow returns `El total en USD es 102.807,49 US$ sobre 110 contratos [1].`

Each phase ships behind `FACTS_ENABLED` and leaves the current refusal behavior
untouched when disabled.
