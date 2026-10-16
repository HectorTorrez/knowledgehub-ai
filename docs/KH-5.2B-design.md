# KH-5.2B — Verify Uploaded Objects

Status: **Revised for review.** The object-integrity gap raised in review (§4) is
resolved with an immutable verified object plus version-bound verification. No
code is written until this revision and §12 are accepted.

Builds directly on the Phase 5.2A upload-URL flow (`apps/api/src/documents`,
`apps/api/src/storage`).

## 1. Goal

Confirm that the object a client uploaded actually exists at the document's
staging key, and that its **real** size, content type, and byte signature satisfy
the upload policy — then promote exactly those verified bytes to a
server-controlled key that the client cannot overwrite, before the document can
leave `PENDING` and enter the processing pipeline.

Phase 5.2A issues a presigned `PUT` and persists a storage key but trusts nothing
about the object. Phase 5.2B is the trust boundary: after it, `contentType`,
`sizeBytes`, and `originalFileName` may be populated, and the document may move to
`PROCESSING` (or `FAILED`).

Phase 5.2B **stops at verification and a state transition.** It does not extract,
chunk, embed, enqueue, or process anything.

## 2. Scope

In scope:

- A storage capability to inspect an object, read a bounded byte prefix, and
  promote an object to a new key.
- A client-to-API "upload finished" contract that lets the client report
  completion **without asserting any verified fact**.
- A verification service: staging-key check, real metadata validation, byte
  signature inspection, and promotion of the verified bytes.
- Idempotent, concurrency-safe `PENDING`/`FAILED` → `PROCESSING` or `FAILED`
  transitions.
- Unit + E2E coverage, a real-MinIO smoke check, and README updates.

Out of scope (explicit non-goals):

- `READY` transition and any actual processing/extraction/chunking/embeddings.
- Background jobs, queues, or scheduled verification. `upload-complete` never
  enqueues or triggers work.
- **Deletion/cleanup of staging objects and orphaned promoted objects** (carried
  from 5.2A limitation #3; see §4).
- Antivirus/content sanitization.
- Pagination, document delete/rename, and any frontend upload UI.
- Multipart uploads.

## 3. The overwrite problem

A presigned `PUT` URL can be reused until it expires. Without more, this sequence
breaks the guarantee:

1. Upload a valid PDF to the staging key; call `upload-complete`; pass
   verification; move to `PROCESSING`.
2. Reuse the still-valid URL to overwrite the staging object with different bytes.

Because the document still points at the staging key, the database cannot tell
that the bytes changed. Binding the update to `storageKey` alone protects against
a *superseded* key, not against an *overwrite of the current* key.

Expiring or revoking the URL afterwards does not help: expiry does not invalidate
an upload already in flight, and the reuse can happen before expiry.

### 3.1 Chosen strategy: immutable verified objects

Split the two roles into two keys:

- **Staging key** (`uploadStorageKey`): the only key a presigned `PUT` can write.
  Client-writable, untrusted, never processed.
- **Verified key** (`storageKey`): server-controlled and never signed or handed
  to a client. Written only by promoting a staging object during verification.
  This is the key every later phase processes.

Verification reads the staging object, validates it, then **copies it to a new
verified key** and persists that key only after the copy succeeds. A reused
presigned URL can only ever overwrite the staging object, which no later phase
reads. Promotion is the trust boundary.

**Version-bound verification.** Every read and the copy are bound to the exact
object version inspected, so the promoted bytes are provably the verified bytes
even if the client overwrites the staging object mid-flight:

1. `inspectObject(stagingKey)` returns metadata with an opaque `version`
   (the object's ETag for these single-part uploads).
2. `readObjectPrefix({ key, maxBytes, version })` fails if the current version is
   no longer `version`.
3. `copyObject({ sourceKey, destinationKey, version })` fails if the source is no
   longer `version`.

A version mismatch means the staging object changed during verification. Nothing
is promoted; the request is `409` and retriable. The promoted destination is
never client-writable, so once written it is immutable for our purposes.

Rejected alternatives:

- **Object versioning.** Production targets R2; versioning support is not uniform
  across providers, so the guarantee would depend on which backend is configured.
- **Conditional upload (`If-None-Match`).** Provider support for conditional
  presigned writes is inconsistent, and it guards creation, not the post-verify
  overwrite window.

### 3.2 Provider assumptions

The port hides the mechanism, but the adapter's guarantee rests on two provider
behaviors that the real-MinIO smoke test (and an R2 check before production) must
confirm:

- ETag is content-derived for single-part `PUT`s (true for S3-compatible
  S3/MinIO/R2 without SSE-C/KMS), so version equality implies byte equality.
- `CopyObject` is supported in-bucket; the adapter may implement the promotion
  guarantee either by a conditional copy or by copy-then-verify the destination
  version. Either way the port contract is identical.

If a deployed provider's ETag is not content-derived, the adapter must fail fast
rather than silently weaken the guarantee.

## 4. Contract

### 4.1 Storage port (`apps/api/src/storage/object-storage.port.ts`)

Extend `ObjectStorage`; keep the port S3-agnostic.

```ts
export interface ObjectMetadata {
  key: string;
  sizeBytes: number;
  contentType: string | null;
  version: string;
}

export interface ObjectStorage {
  createPresignedUpload(input: PresignedUploadInput): Promise<PresignedUpload>;
  inspectObject(key: string): Promise<ObjectMetadata | null>;
  readObjectPrefix(input: {
    key: string;
    maxBytes: number;
    version: string;
  }): Promise<Uint8Array>;
  copyObject(input: {
    sourceKey: string;
    destinationKey: string;
    version: string;
  }): Promise<void>;
}
```

- `inspectObject` is `HeadObject` behind the adapter. Returns `null` for a missing
  key (`NotFound`/`NoSuchKey`); rethrows other errors. Callers never see SDK error
  types.
- `readObjectPrefix` is `GetObject` with `Range: bytes=0-<maxBytes-1>` and
  `If-Match: version`. Needed because `HeadObject` returns no bytes.
- `copyObject` is a server-side in-bucket copy bound to `version`; it must
  guarantee the destination contains exactly the bytes of that version.
- A version mismatch surfaces as a port-level typed error (e.g.
  `ObjectVersionMismatchError`), not a raw SDK code.

`S3ObjectStorage` maps these to commands and remains the only module that imports
the AWS SDK. `FakeObjectStorage` keeps an in-memory map and can simulate version
changes, absent keys, oversized objects, and wrong signatures.

### 4.2 Endpoint

```
POST /organizations/:organizationId/documents/:documentId/upload-complete
```

Pairs symmetrically with `POST …/upload-url`. Same guards and tenant scoping as
every other document route: cross-organization and nonexistent documents both
return `404`.

Request body: optionally `{ "originalFileName"?: string }` (trimmed, 1–255
characters, strict object; missing body tolerated; unknown fields `400`).
`originalFileName` is the only client-supplied value, treated as declared display
metadata and documented as unverified. The client cannot send `storageKey`,
`sizeBytes`, `contentType`, or `status`. **The API only ever verifies the staging
key it persisted**; a client cannot ask the API to inspect or promote an arbitrary
key.

Response: `200 { document }` (`DocumentDetailResponse`) with the post-completion
state. `DocumentSummary` gains `failureReason: string | null` (D3).

Status codes:

| Condition | Code | State change |
| --- | --- | --- |
| Verified, valid object, promoted | `200` | `PENDING`/`FAILED` → `PROCESSING`; verified metadata + verified key set |
| Definitive policy violation | `200` (`status: FAILED`) | → `FAILED` with sanitized reason |
| No staging key / no expected type (no `upload-url` yet) | `409` | none |
| Object absent at the staging key | `409` | none |
| Staging object changed during verification | `409` | none (retriable) |
| Upload superseded during verification | `409` | none (retriable) |
| Already `PROCESSING`/`READY` | `200` (current) | none (idempotent short-circuit) |
| Transient storage failure | `503` | none |
| Not a member | `403` | none |
| Not authenticated | `401` | none |
| Malformed id / extra or invalid body field | `400` | none |

Both success and definitive-failure return `200`, carrying the outcome in
`document.status`; this keeps the call idempotent and makes the document, not the
response code, the source of truth.

### 4.3 `upload-url` (small change)

`upload-url` now persists the staging key in `uploadStorageKey` and never touches
`storageKey`, so re-requesting a URL cannot clobber a verified object. It is
allowed only when `status` is `PENDING` or `FAILED`; a `PROCESSING`/`READY`
document returns `409`, which prevents pointless orphan uploads. Retry after
`FAILED` is the intended path (new staging key → upload → `upload-complete`).

## 5. Verification flow

1. Load the document scoped by `{ id, organizationId }`. Missing → `404`.
2. If `status` is `PROCESSING` or `READY`: return the current document (`200`)
   without inspecting, promoting, rewriting metadata, enqueuing, or changing any
   key. This is the explicit idempotent short-circuit (§6).
3. Require `uploadStorageKey` and `expectedContentType`; either null → `409`.
4. Assert `uploadStorageKey` is well-formed for this org + document
   (`organizations/<orgId>/documents/<docId>/<token>`). A mismatch is a
   config/data fault (`503`, no state change) and is never trusted as a key.
5. `inspectObject(uploadStorageKey)`.
   - `null` → `409`, no state change (not yet uploaded, or uploaded to a
     superseded URL — both retriable, not a recorded failure).
   - Transient error → `503`, no state change.
6. Validate real metadata: `0 < sizeBytes <= MAX_UPLOAD_BYTES`, and
   `contentType` equals `expectedContentType` and is allowlisted. Violation →
   `FAILED`.
7. `readObjectPrefix({ key, maxBytes: SIGNATURE_PREFIX_BYTES, version })` and
   inspect the signature (§7). Violation → `FAILED`. A version mismatch → `409`,
   no state change.
8. Build a fresh verified key
   `organizations/<orgId>/documents/<docId>/verified/<token>` and
   `copyObject({ sourceKey, destinationKey: verifiedKey, version })`. A version
   mismatch → `409`, no state change.
9. Conditional DB update (§6) binding on the staging key:
   `where { id, organizationId, uploadStorageKey, status IN (PENDING, FAILED) }`
   → set `storageKey = verifiedKey`, `status = PROCESSING`, verified
   `contentType`/`sizeBytes` from the inspected object, `originalFileName` from
   the request when supplied, clear `failureReason`. If zero rows matched, the
   upload was superseded: return `409`; the just-promoted object is orphaned (see
   §3.1 non-goals).
10. Return `200 { document }`.

Definitive-failure path (steps 6–7) uses the same conditional update, setting
`status = FAILED` and a sanitized `failureReason`.

Validation logic lives in a pure, framework-free module (e.g.
`verification-policy.ts`), unit-testable without Nest or S3.

## 6. Lifecycle and concurrency

The transition is an atomic conditional update, not read-then-write; promotion is
bound to the staging key that was verified.

- **Superseded staging key:** if `upload-url` replaced `uploadStorageKey` between
  the read and the update, the predicate matches zero rows. Return `409`; never
  write a verified key derived from a staging key that is no longer current.
- **Concurrent completes:** each promotes to its own verified key; the first
  conditional update wins. The loser matches zero rows (status is now
  `PROCESSING`) and returns the current document; its promoted object is orphaned.
- **Reused presigned URL after success:** can only overwrite the staging object,
  which `storageKey` no longer references. Later phases read the verified key.
- **Retry after `FAILED`:** verification is allowed from `FAILED`; a fresh URL
  supersedes `uploadStorageKey` and the next completion promotes the new bytes.
- **`PROCESSING`/`READY`:** pure short-circuit; no inspection, no promotion, no
  metadata rewrite, no key change, no enqueue.

`PROCESSING` therefore means "the verified bytes exist at a server-controlled key
and are ready to be processed." It does not mean processing has begun, and this
increment starts no work.

## 7. Failure reasons and signature checks

`failureReason` is a sanitized, fixed-vocabulary string — never a raw exception,
SDK message, or key. Values: `EMPTY_OBJECT`, `SIZE_LIMIT_EXCEEDED`,
`CONTENT_TYPE_NOT_ALLOWED`, `CONTENT_TYPE_MISMATCH`, `SIGNATURE_MISMATCH`.

Signature inspection reads only a bounded prefix (`SIGNATURE_PREFIX_BYTES`, 1024):

- **`application/pdf`:** `%PDF-` must appear within the first 1024 bytes (the PDF
  spec tolerates leading bytes before the header). This is a **lightweight
  signature check only**: it does not establish that the file is a valid, safe, or
  parseable PDF. That distinction is stated in the README and preserved before
  any future extraction work.
- **`text/plain` / `text/markdown`:** the prefix must decode as **strict UTF-8**
  (malformed sequences rejected) and contain no NUL byte. Because a strict decode
  of a fixed-length prefix can fail only because it cut a multi-byte sequence at
  the boundary, the implementation reads a few extra bytes and trims to a valid
  boundary before judging. Only the bounded prefix is read.
- **Empty object:** `sizeBytes === 0` → `FAILED` with `EMPTY_OBJECT` before any
  prefix read, consistent with the `0 < sizeBytes` rule.

Absent, superseded, and version-mismatch cases (`409`) and transient faults
(`503`) never set a reason or change status.

## 8. Data model

Required changes:

- **`uploadStorageKey String?`** (new): the client-writable staging key, set by
  `upload-url`. Holds what 5.2A stored in `storageKey`.
- **`storageKey String?`** (existing, reinterpreted): the server-controlled
  verified key, set only by `upload-complete`; never signed, never exposed.
- **`expectedContentType String?`** (new): the type the URL was signed for, set at
  `upload-url`, compared against the stored object.

Migration for existing rows: move `storageKey` → `uploadStorageKey` and set
`storageKey` to `NULL`, since nothing has been verified yet. `expectedContentType`
for pre-existing rows is `NULL`, so completion returns `409` until a fresh upload
URL is requested.

`DocumentSummary.failureReason: string | null` is added to the public contract
(D3). Verified `sizeBytes` stays `Int` (fits under the 2e9 cap).

## 9. Security

- Tenant scoping is unchanged: every query carries `organizationId`; cross-org and
  nonexistent documents return the same `404`.
- The client can influence only the staging object and the declared filename — not
  the verified key, verified facts, or status.
- Verified bytes are promoted to a key that is never present in any presigned URL.
- `uploadStorageKey`, `storageKey`, `uploadedById`, and `organizationId` remain
  absent from every response.
- `failureReason` is public but carries only the fixed vocabulary above.
- Object bytes cross the API boundary only as a small bounded prefix; full objects
  are never streamed.

## 10. Tests

Unit:

- `verification-policy`: size cap boundary, zero byte, allowlist,
  expected-vs-actual type, PDF magic at offset 0 and within 1024 bytes, PDF magic
  absent, malformed UTF-8 rejected, NUL rejected, valid UTF-8 accepted, multibyte
  sequence split at the prefix boundary accepted.
- `S3ObjectStorage`: `inspectObject` issues `HeadObjectCommand` and maps metadata,
  returns `null` on `NotFound`, rethrows other errors; `readObjectPrefix` issues
  `GetObjectCommand` with `Range` and `If-Match`; `copyObject` issues a bound copy
  and maps a precondition failure to the version-mismatch error.
- `FakeObjectStorage` seeding, version changes, and version-bound read/copy.

E2E (`documents` suite):

- `401` unauthenticated, `403` non-member, `404` cross-org/nonexistent, `400`
  malformed ids and invalid/extra body fields, each writing nothing.
- `409` when no `upload-url` was requested.
- `409` when the object is absent at the staging key, document left `PENDING`.
- Valid upload → `200`, `PROCESSING`, verified `contentType`/`sizeBytes` set,
  `storageKey` differs from `uploadStorageKey` and points at the promoted object,
  `failureReason` cleared.
- **Overwrite-after-verify:** complete successfully, then overwrite the staging
  key (simulated reused URL) with different bytes; the document's verified key and
  bytes are unchanged.
- **Version race:** mutate the staging object between inspect and copy → `409`,
  no state change, nothing promoted.
- Real size above the cap → `FAILED` + `SIZE_LIMIT_EXCEEDED`; zero byte →
  `EMPTY_OBJECT`; disallowed/mismatched type → matching reason; wrong signature →
  `SIGNATURE_MISMATCH`.
- Superseded staging key: request two URLs, upload only at the first, complete →
  `409`, document untouched.
- Concurrent completes → one transition, no stale writes.
- Repeat complete after `PROCESSING` → `200`, identical document, no storage calls
  (no inspect/read/copy), no enqueue.
- `upload-url` on a `PROCESSING` document → `409` and the verified key untouched.
- Retry after `FAILED`: new URL → upload → complete → `PROCESSING`.
- Transient storage error → `503`, state unchanged.
- Response shape excludes internal fields; `failureReason` contains no key or
  exception text.

Existing `documents.e2e-spec.ts` assertions change: upload-url now writes
`uploadStorageKey`, and the public document gains `failureReason` (D3).

Integration smoke: an opt-in script/test that uploads a real object to local MinIO
via the presigned URL and exercises `HeadObject`, version-bound `GET`, and
`CopyObject` promotion. This validates the §3.2 provider assumptions and closes
5.2A limitation #4 for the verification path.

## 11. Documentation

README gains: the `upload-complete` endpoint, the staging-vs-verified key model
and why it exists, the status machine (`PENDING → PROCESSING | FAILED`), what
verification inspects and what it does not prove, and updated limitations
(orphaned staging/verified objects and cleanup still pending; text sniffing is
structural, not semantic; PDF signature is not validation; `READY`/processing
still pending).

## 12. Acceptance criteria

- [ ] `ObjectStorage` exposes `inspectObject`, version-bound `readObjectPrefix`,
      and version-bound `copyObject`; only the S3 adapter imports the AWS SDK.
- [ ] `upload-complete` requires auth + membership, is tenant-scoped, and rejects
      invalid/unknown body fields.
- [ ] The client cannot supply or influence the verified key or any verified fact.
- [ ] Verified bytes are promoted to a server-controlled key; a reused presigned
      URL that overwrites the staging object does not change the verified bytes.
- [ ] Reads and promotion are bound to one object version; a mid-flight change is
      `409` with nothing promoted.
- [ ] Missing staging key, absent object, version mismatch, supersession, and
      transient faults are retriable and do not change state.
- [ ] A valid object transitions `PENDING`/`FAILED` → `PROCESSING` and populates
      verified `contentType`/`sizeBytes` only from inspected metadata.
- [ ] Oversized actual size, empty object, disallowed/mismatched type, and bad
      signature transition to `FAILED` with a sanitized reason.
- [ ] `PROCESSING`/`READY` completion is a pure no-op: no inspect, promote,
      rewrite, key change, or enqueue.
- [ ] `upload-url` never clobbers a verified key and is rejected on
      `PROCESSING`/`READY`.
- [ ] Repeated completes are idempotent; retry after `FAILED` reaches `PROCESSING`.
- [ ] Public responses exclude `uploadStorageKey`, `storageKey`, `uploadedById`,
      and `organizationId`; failures leak no internal detail.
- [ ] Unit + E2E suites pass, with a MinIO smoke check covering promotion and
      version binding; lint and type checks clean.
- [ ] README updated, including the signature-vs-validation distinction.

## 13. Decisions (agreed)

- **D1** Store `expectedContentType` (§8).
- **D2** Absent object → `409`, retriable, no state change (§4.2).
- **D3** Add sanitized `failureReason: string | null` to `DocumentSummary` (§8).
- **D4** Accept optional `originalFileName` as declared display metadata (§4.2, §5).
- **D5** Definitive failure → `200` with `status: FAILED` (§4.2).
- **D6** Object integrity via immutable verified objects with version-bound reads
  and promotion; staging and verified keys are distinct columns (§3, §8).
