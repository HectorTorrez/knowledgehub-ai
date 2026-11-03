export function initials(firstName: string, lastName: string): string {
  return [firstName, lastName]
    .map((name) => Array.from(name.trim())[0] ?? '')
    .join('')
    .toUpperCase();
}
