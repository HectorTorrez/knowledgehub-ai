export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !('tagName' in target)) {
    return false;
  }

  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    ('isContentEditable' in target && target.isContentEditable === true)
  );
}
