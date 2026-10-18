import { getModelContext } from './context';
import type { WebMcpTool } from './types';

const registrations = new Map<string, AbortController>();

export function registerWebMcpTool(tool: WebMcpTool): () => void {
  const context = getModelContext();

  if (context === null) {
    return () => undefined;
  }

  registrations.get(tool.name)?.abort();

  const controller = new AbortController();
  registrations.set(tool.name, controller);

  void context
    .registerTool(tool, { signal: controller.signal })
    .catch(() => undefined);

  return () => {
    if (registrations.get(tool.name) === controller) {
      registrations.delete(tool.name);
      controller.abort();
    }
  };
}
