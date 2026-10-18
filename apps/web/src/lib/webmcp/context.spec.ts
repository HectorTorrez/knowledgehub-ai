import { afterEach, describe, expect, it, vi } from 'vitest';
import { getModelContext } from './context';
import type { ModelContext } from './types';

function fakeContext(): ModelContext {
  return {
    registerTool: vi.fn(async () => undefined),
    getTools: vi.fn(async () => []),
    executeTool: vi.fn(async () => '{}'),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getModelContext', () => {
  it('returns null when no host exposes a model context', () => {
    vi.stubGlobal('document', {});
    vi.stubGlobal('navigator', {});

    expect(getModelContext()).toBeNull();
  });

  it('returns the document model context when present', () => {
    const context = fakeContext();
    vi.stubGlobal('document', { modelContext: context });
    vi.stubGlobal('navigator', {});

    expect(getModelContext()).toBe(context);
  });

  it('falls back to the deprecated navigator namespace', () => {
    const context = fakeContext();
    vi.stubGlobal('document', {});
    vi.stubGlobal('navigator', { modelContext: context });

    expect(getModelContext()).toBe(context);
  });
});
