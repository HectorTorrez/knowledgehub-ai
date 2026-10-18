import { useEffect, useRef } from 'react';
import { registerWebMcpTool } from '~/lib/webmcp/register';
import type { WebMcpToolDefinition, WebMcpToolExecute } from '~/lib/webmcp/types';

export function useWebMcpTool(
  definition: WebMcpToolDefinition | null,
  execute: WebMcpToolExecute,
): void {
  const executeRef = useRef(execute);
  executeRef.current = execute;

  useEffect(() => {
    if (definition === null) {
      return;
    }

    return registerWebMcpTool({
      ...definition,
      execute: (input, options) => executeRef.current(input, options),
    });
  }, [definition]);
}
