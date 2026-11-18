export const MAX_FOLLOW_UPS = 3;
export const MAX_STARTERS = 4;
export const MAX_SUGGESTION_CHARS = 160;
const MIN_SUGGESTION_CHARS = 8;

export function sanitizeSuggestions(raw: unknown, limit: number): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const seen = new Set<string>();
  const questions: string[] = [];

  for (const item of raw) {
    if (typeof item !== 'string') {
      continue;
    }

    const question = item.replace(/\s+/g, ' ').trim();
    const key = question.toLocaleLowerCase();

    if (
      question.length < MIN_SUGGESTION_CHARS ||
      question.length > MAX_SUGGESTION_CHARS ||
      seen.has(key)
    ) {
      continue;
    }

    seen.add(key);
    questions.push(question);

    if (questions.length === limit) {
      break;
    }
  }

  return questions;
}
