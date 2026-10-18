import type { ModelContext, ModelContextHost } from './types';

export function getModelContext(): ModelContext | null {
  if (typeof document !== 'undefined') {
    const context = (document as unknown as ModelContextHost).modelContext;

    if (context !== undefined) {
      return context;
    }
  }

  if (typeof navigator !== 'undefined') {
    const context = (navigator as unknown as ModelContextHost).modelContext;

    if (context !== undefined) {
      return context;
    }
  }

  return null;
}
