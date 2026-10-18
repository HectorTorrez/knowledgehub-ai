import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerWebMcpTool } from './register';
import type { ModelContext, WebMcpTool } from './types';

interface Registration {
  tool: WebMcpTool;
  signal?: AbortSignal;
}

function tool(name = 'get_session'): WebMcpTool {
  return { name, description: 'Test tool.', execute: async () => ({}) };
}

function fakeContext() {
  const registrations: Registration[] = [];
  const context: ModelContext = {
    registerTool: vi.fn(async (registered, options) => {
      registrations.push({ tool: registered, signal: options?.signal });
    }),
    getTools: vi.fn(async () => []),
    executeTool: vi.fn(async () => '{}'),
  };

  return { context, registrations };
}

function install(context: ModelContext | undefined): void {
  vi.stubGlobal('document', context === undefined ? {} : { modelContext: context });
  vi.stubGlobal('navigator', {});
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registerWebMcpTool', () => {
  it('is a no-op disposer when the browser has no model context', () => {
    install(undefined);

    const dispose = registerWebMcpTool(tool());

    expect(() => dispose()).not.toThrow();
  });

  it('registers the tool with an un-aborted signal', () => {
    const { context, registrations } = fakeContext();
    install(context);

    registerWebMcpTool(tool());

    expect(registrations).toHaveLength(1);
    expect(registrations[0]?.signal?.aborted).toBe(false);
  });

  it('aborts the registration signal when disposed', () => {
    const { context, registrations } = fakeContext();
    install(context);

    registerWebMcpTool(tool())();

    expect(registrations[0]?.signal?.aborted).toBe(true);
  });

  it('aborts the previous registration when the same name is registered again', () => {
    const { context, registrations } = fakeContext();
    install(context);

    registerWebMcpTool(tool('list_documents'));
    registerWebMcpTool(tool('list_documents'));

    expect(registrations).toHaveLength(2);
    expect(registrations[0]?.signal?.aborted).toBe(true);
    expect(registrations[1]?.signal?.aborted).toBe(false);
  });

  it('does not throw when the browser rejects the registration', async () => {
    const context: ModelContext = {
      registerTool: vi.fn(async () => {
        throw new Error('InvalidStateError');
      }),
      getTools: vi.fn(async () => []),
      executeTool: vi.fn(async () => '{}'),
    };
    install(context);

    expect(() => registerWebMcpTool(tool())).not.toThrow();
    await Promise.resolve();
  });

  it('tolerates a second dispose', () => {
    const { context } = fakeContext();
    install(context);

    const dispose = registerWebMcpTool(tool());
    dispose();

    expect(() => dispose()).not.toThrow();
  });

  it('leaves the replacement registration intact when a stale disposer runs', () => {
    const { context, registrations } = fakeContext();
    install(context);

    const firstDispose = registerWebMcpTool(tool('list_documents'));
    registerWebMcpTool(tool('list_documents'));

    firstDispose();

    expect(registrations[1]?.signal?.aborted).toBe(false);
  });
});
