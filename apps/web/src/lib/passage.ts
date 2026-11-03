export interface PassageRange {
  start: number;
  end: number;
}

interface NormalizedText {
  text: string;
  sourceOffsets: number[];
}

const MIN_FALLBACK_WORDS = 3;
const MIN_FALLBACK_CHARACTERS = 20;
const LINE_BREAK_HYPHENATION = /^-[^\S\n]*\n\s*/;

function normalize(value: string): NormalizedText {
  let text = '';
  const sourceOffsets: number[] = [];
  let index = 0;

  while (index < value.length) {
    const hyphenation = LINE_BREAK_HYPHENATION.exec(value.slice(index));
    if (hyphenation) {
      index += hyphenation[0].length;
      continue;
    }

    const char = value[index]!;
    if (/\s/.test(char)) {
      if (text.length > 0 && !text.endsWith(' ')) {
        text += ' ';
        sourceOffsets.push(index);
      }
    } else {
      text += char.toLowerCase();
      sourceOffsets.push(index);
    }
    index += 1;
  }

  return { text, sourceOffsets };
}

function longestMatchingWordSpan(
  haystack: string,
  words: string[],
): { index: number; length: number } | undefined {
  for (let size = words.length - 1; size >= MIN_FALLBACK_WORDS; size -= 1) {
    for (let start = 0; start + size <= words.length; start += 1) {
      const candidate = words.slice(start, start + size).join(' ');
      if (candidate.length < MIN_FALLBACK_CHARACTERS) continue;
      const index = haystack.indexOf(candidate);
      if (index >= 0) return { index, length: candidate.length };
    }
  }
  return undefined;
}

export function findPassage(
  text: string,
  quote: string,
): PassageRange | undefined {
  const haystack = normalize(text);
  const needle = normalize(quote).text.trim();
  if (needle.length === 0) return undefined;

  const exact = haystack.text.indexOf(needle);
  const match =
    exact >= 0
      ? { index: exact, length: needle.length }
      : longestMatchingWordSpan(haystack.text, needle.split(' '));
  if (!match) return undefined;

  return {
    start: haystack.sourceOffsets[match.index]!,
    end: haystack.sourceOffsets[match.index + match.length - 1]! + 1,
  };
}

export function overlapsPassage(
  range: PassageRange,
  start: number,
  end: number,
): boolean {
  return start < range.end && end > range.start;
}
