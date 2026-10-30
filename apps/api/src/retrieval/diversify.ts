import { MAX_CHUNKS_PER_DOCUMENT } from "./retrieval-policy.js";
import type { RetrievedChunk } from "./retrieval.service.js";

export function diversify(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const counts = new Map<string, number>();
  return chunks.filter((chunk) => {
    const count = counts.get(chunk.documentId) ?? 0;
    if (count >= MAX_CHUNKS_PER_DOCUMENT) return false;
    counts.set(chunk.documentId, count + 1);
    return true;
  });
}
