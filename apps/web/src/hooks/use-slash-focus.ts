import { useEffect, type RefObject } from 'react';
import { isTypingTarget } from '~/lib/typing-target';

export function useSlashFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if (
        event.key !== '/' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      ref.current?.focus();
    }

    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, [ref]);
}
