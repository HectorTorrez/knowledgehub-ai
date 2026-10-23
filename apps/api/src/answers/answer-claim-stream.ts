import type { AnswerResponse } from '@knowledgehub/shared-types';

export interface ParsedAnswerClaim {
  text: string;
  source: number;
}

const STATUS_PATTERN = /"status"\s*:\s*"(answered|insufficient_evidence)"/;
const CLAIMS_PATTERN = /"claims"\s*:\s*/;
const WHITESPACE = /^\s$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function findObjectEnd(text: string, start: number): number | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return null;
}

function parseClaim(piece: string): ParsedAnswerClaim | null {
  let value: unknown;

  try {
    value = JSON.parse(piece);
  } catch {
    return null;
  }

  if (!isRecord(value) || typeof value.text !== 'string') {
    return null;
  }

  if (typeof value.source !== 'number' || !Number.isInteger(value.source)) {
    return null;
  }

  return { text: value.text, source: value.source };
}

export class AnswerStreamParser {
  private raw = '';
  private cursor: number | null = null;
  private closed = false;
  private status: AnswerResponse['status'] | null = null;

  get draft(): string {
    return this.raw;
  }

  get answerStatus(): AnswerResponse['status'] | null {
    return this.status;
  }

  get complete(): boolean {
    return this.closed;
  }

  push(delta: string): ParsedAnswerClaim[] {
    this.raw += delta;

    if (this.status === null) {
      const status = STATUS_PATTERN.exec(this.raw);

      if (status !== null) {
        this.status = status[1] as AnswerResponse['status'];
      }
    }

    if (this.closed) {
      return [];
    }

    let start = this.cursor;

    if (start === null) {
      const claims = CLAIMS_PATTERN.exec(this.raw);

      if (claims === null) {
        return [];
      }

      const markerStart = claims.index + claims[0].length;
      const rest = this.raw.slice(markerStart);

      if (rest.length === 0) {
        return [];
      }

      if (rest[0] !== '[') {
        this.closed = rest.startsWith('null');
        return [];
      }

      start = markerStart + 1;
    }

    if (start === null) {
      return [];
    }

    const parsed: ParsedAnswerClaim[] = [];
    let cursor = start;

    for (;;) {
      while (
        cursor < this.raw.length &&
        (WHITESPACE.test(this.raw[cursor] as string) ||
          this.raw[cursor] === ',')
      ) {
        cursor += 1;
      }

      if (cursor >= this.raw.length) {
        break;
      }

      const char = this.raw[cursor];

      if (char === ']') {
        this.closed = true;
        cursor += 1;
        break;
      }

      if (char !== '{') {
        break;
      }

      const end = findObjectEnd(this.raw, cursor);

      if (end === null) {
        break;
      }

      const claim = parseClaim(this.raw.slice(cursor, end + 1));

      if (claim === null) {
        break;
      }

      parsed.push(claim);
      cursor = end + 1;
    }

    this.cursor = cursor;

    return parsed;
  }
}
