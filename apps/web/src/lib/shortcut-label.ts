export function shortcutLabel(platform: string): string {
  return /Mac|iPhone|iPad/i.test(platform) ? '⌘K' : 'Ctrl K';
}
