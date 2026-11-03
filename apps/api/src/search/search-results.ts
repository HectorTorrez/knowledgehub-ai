import type { SearchMatch, SearchResult } from '@knowledgehub/shared-types';
import type { RetrievedChunk } from '../retrieval/retrieval.service.js';

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function createSearchMatch(chunk: RetrievedChunk, query: string): SearchMatch {
  const tokens = [...new Set((normalize(query).match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => token.length >= 2))];
  let normalized = '';
  const offsets: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < chunk.content.length;) {
    const char = String.fromCodePoint(chunk.content.codePointAt(i)!);
    const end = i + char.length;
    const folded = normalize(char);
    normalized += folded;
    for (let j = 0; j < folded.length; j++) offsets.push({ start: i, end });
    if (!folded && offsets.length) offsets[offsets.length - 1]!.end = end;
    i = end;
  }
  const ranges: Array<{ start: number; end: number }> = [];
  for (const token of tokens) {
    let pos = normalized.indexOf(token);
    while (pos !== -1) {
      ranges.push({ start: offsets[pos]!.start, end: offsets[pos + token.length - 1]!.end });
      pos = normalized.indexOf(token, pos + 1);
    }
  }
  ranges.sort ( (a, b) => a.start - b.start || a.end - b.end);
  const merged: typeof ranges = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  let start = Math.max(0, (merged[0]?.start ?? 0) - 100);
  if (start > 0) while (start > 0 && /\S/u.test(chunk.content[start - 1]!)) start--;
  let end = Math.min(chunk.content.length, start + 300);
  while (end < chunk.content.length && /\S/u.test(chunk.content[end]!)) end++;
  const excerpt = chunk.content.slice(start, end);
  return { pageNumber: chunk.pageNumber, chunkIndex: chunk.chunkIndex, excerpt, highlights: merged.filter((r) => r.start >= start && r.end <= end).map((r) => ({ start: r.start - start, end: r.end - start })) };
}

function overlaps(a: RetrievedChunk, b: RetrievedChunk): boolean {
  if (a.pageNumber !== b.pageNumber || Math.abs(a.chunkIndex - b.chunkIndex) !== 1) return false;
  const left = a.chunkIndex < b.chunkIndex ? a.content : b.content;
  const right = a.chunkIndex < b.chunkIndex ? b.content : a.content;
  const minimum = Math.ceil(Math.min(left.length, right.length) * 0.5);
  for (let length = Math.min(left.length, right.length); length >= minimum && length > 0; length--) {
    if (left.slice(-length) === right.slice(0, length)) return true;
  }
  return false;
}

export function groupSearchResults(chunks: RetrievedChunk[], query: string, limit: number): SearchResult[] {
  const groups = new Map<string, RetrievedChunk[]>();
  for (const chunk of chunks) {
    const group = groups.get(chunk.documentId) ?? [];
    group.push(chunk);
    groups.set(chunk.documentId, group);
  }
  return [...groups.values()].map((group) => {
    group.sort((a, b) => b.relevance - a.relevance);
    const best = group[0]!;
    const selected: RetrievedChunk[] = [];
    for (const chunk of group) {
      if (selected.length < 3 && !selected.some((other) => overlaps(other, chunk))) selected.push(chunk);
    }
    return { documentId: best.documentId, documentTitle: best.title, score: best.relevance, matchCount: group.length, matches: selected.map((chunk) => createSearchMatch(chunk, query)) };
  }).sort((a, b) => b.score - a.score).slice(0, limit);
}
