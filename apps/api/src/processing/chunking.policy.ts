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

function normalizePageText(content: string): string {
  return content.replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/[^\S\n]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function chunkBoundary(text: string, start: number, windowEnd: number): number {
  if (windowEnd >= text.length) {
    return text.length;
  }

  const window = text.slice(start, windowEnd);
  const paragraph = window.lastIndexOf('\n\n');
  const sentences = [...window.matchAll(/[.!?]["')\]]?(?=\s)/g)];
  const sentence = sentences.at(-1);
  const sentenceEnd = sentence ? sentence.index + sentence[0].length : -1;
  const word = Math.max(window.lastIndexOf(' '), window.lastIndexOf('\n'));

  for (const boundary of [paragraph, sentenceEnd, word]) {
    if (boundary >= MIN_SNAPPABLE_CHUNK_CHARACTERS) {
      return start + boundary;
    }
  }
  return windowEnd;
}

export function chunkPages(pages: ChunkablePage[]): DocumentChunkDraft[] {
  const chunks: DocumentChunkDraft[] = [];

  for (const page of pages) {
    const text = normalizePageText(page.content);
    let start = 0;

    while (start < text.length) {
      const windowEnd = Math.min(start + CHUNK_TARGET_CHARACTERS, text.length);
      const end = chunkBoundary(text, start, windowEnd);
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

      start = Math.max(end - CHUNK_OVERLAP_CHARACTERS, start + 1);
    }
  }

  return chunks;
}
