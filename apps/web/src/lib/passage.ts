export function findPassage(text: string, quote: string): { start: number; end: number } | undefined {
  function normalize(value: string) {
    let normalized = '';
    const offsets: number[] = [];
    for (let i = 0; i < value.length; i++) {
      if (value[i] === '-' && /^\s*\n\s*/.test(value.slice(i + 1))) { i += value.slice(i + 1).match(/^\s*\n\s*/)?.[0].length ?? 0; continue; }
      const char = value[i]!.toLowerCase();
      if (/\s/.test(char)) {
        if (!normalized || normalized.endsWith(' ')) continue;
        normalized += ' ';
      } else normalized += char;
      offsets.push(i);
    }
    return { normalized, offsets };
  }
  const haystack = normalize(text);
  const needle = normalize(quote).normalized.trim();
  if (!needle) return undefined;
  let match = needle;
  let index = haystack.normalized.indexOf(match);
  if (index < 0) {
    const words = needle.split(' ');
    for (let length = words.length - 1; length >= 3 && index < 0; length--) {
      for (let start = 0; start + length <= words.length; start++) {
        const candidate = words.slice(start, start + length).join(' ');
        if (candidate.length < 20) continue;
        index = haystack.normalized.indexOf(candidate);
        if (index >= 0) { match = candidate; break; }
      }
    }
  }
  if (index < 0) return undefined;
  return { start: haystack.offsets[index]!, end: haystack.offsets[index + match.length - 1]! + 1 };
}
