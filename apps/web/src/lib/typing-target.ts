const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !('tagName' in target)) {
    return false;
  }

  if (target.tagName === 'INPUT') {
    const type = 'type' in target ? String(target.type).toLowerCase() : '';
    return !NON_TEXT_INPUT_TYPES.has(type);
  }

  return (
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    ('isContentEditable' in target && target.isContentEditable === true)
  );
}
