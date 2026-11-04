export const CHUNKING_VERSION = 2;

export const CHUNK_TARGET_CHARACTERS = 1600;

export const CHUNK_OVERLAP_CHARACTERS = 320;

export const MAX_CHUNKS_PER_GENERATION = 2000;

export interface ChunkablePage {
  pageNumber: number;
  content: string;
}

export interface DocumentChunkDraft {
  pageNumber: number;
  chunkIndex: number;
  content: string;
  characterCount: number;
}

export class ChunkLimitExceededError extends Error {
  constructor() {
    super('The document produced too many chunks');
    this.name = 'ChunkLimitExceededError';
  }
}

const MIN_SNAPPABLE_CHUNK_CHARACTERS = CHUNK_TARGET_CHARACTERS / 2;

interface NormalizedPage {
  text: string;
  tableRows: Array<{ start: number; end: number }>;
}

function normalizePageText(content: string): NormalizedPage {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const normalized: string[] = [];
  const tableRows: NormalizedPage['tableRows'] = [];
  let length = 0;
  for (const line of lines) {
    const value = line.trim().replace(/[ \t]+/g, ' ');
    if (!value && normalized.at(-1) === '') continue;
    if (normalized.length) length++;
    if (value && /\t| {2,}|\|/.test(line)) {
      tableRows.push({ start: length, end: length + value.length });
    }
    normalized.push(value);
    length += value.length;
  }
  const joined = normalized.join('\n');
  const leading = joined.length - joined.trimStart().length;
  return {
    text: joined.trim(),
    tableRows: tableRows.map((row) => ({
      start: row.start - leading,
      end: row.end - leading,
    })),
  };
}

function chunkBoundary(
  text: string,
  start: number,
  windowEnd: number,
  rows: NormalizedPage['tableRows'],
): number {
  if (windowEnd >= text.length) return text.length;
  const row = rows.find(
    (item) =>
      item.start < windowEnd &&
      item.end > windowEnd &&
      item.end - item.start <= CHUNK_TARGET_CHARACTERS,
  );
  const limit = row ? row.start : windowEnd;
  const window = text.slice(start, limit);
  const candidates = [
    window.lastIndexOf('\n\n'),
    window.lastIndexOf('\n'),
    ...[...window.matchAll(/[.!?](?= )/g)]
      .map((match) => match.index + 1)
      .slice(-1),
    window.lastIndexOf(' '),
  ];
  for (const candidate of candidates) {
    if (
      candidate !== undefined &&
      candidate >= MIN_SNAPPABLE_CHUNK_CHARACTERS &&
      !rows.some(
        (item) =>
          item.start < start + candidate &&
          item.end > start + candidate &&
          item.end - item.start <= CHUNK_TARGET_CHARACTERS,
      )
    )
      return start + candidate;
  }
  return limit > start ? limit : windowEnd;
}

export function chunkPages(pages: ChunkablePage[]): DocumentChunkDraft[] {
  const chunks: DocumentChunkDraft[] = [];

  for (const page of pages) {
    const { text, tableRows } = normalizePageText(page.content);
    let start = 0;

    while (start < text.length) {
      const windowEnd = Math.min(start + CHUNK_TARGET_CHARACTERS, text.length);
      const end = chunkBoundary(text, start, windowEnd, tableRows);
      const content = text.slice(start, end).trim();

      if (content.length > 0) {
        if (chunks.length >= MAX_CHUNKS_PER_GENERATION) {
          throw new ChunkLimitExceededError();
        }

        chunks.push({
          pageNumber: page.pageNumber,
          chunkIndex: chunks.length,
          content,
          characterCount: content.length,
        });
      }

      if (end >= text.length) {
        break;
      }

      const next = Math.max(end - CHUNK_OVERLAP_CHARACTERS, start + 1);
      const row = tableRows.find(
        (item) =>
          item.start < next &&
          item.end > next &&
          item.end - item.start <= CHUNK_TARGET_CHARACTERS,
      );
      start = row ? (row.start > start ? row.start : row.end) : next;
    }
  }

  return chunks;
}
