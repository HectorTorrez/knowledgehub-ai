export interface WebMcpToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
  consequentialHint?: boolean;
  debugging?: boolean;
}

export interface WebMcpToolDefinition {
  name: string;
  description: string;
  title?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: WebMcpToolAnnotations;
}

export interface WebMcpExecuteOptions {
  signal?: AbortSignal;
}

export type WebMcpToolExecute = (
  input?: unknown,
  options?: WebMcpExecuteOptions,
) => Promise<unknown>;

export interface WebMcpTool extends WebMcpToolDefinition {
  execute: WebMcpToolExecute;
}

export interface WebMcpRegisterOptions {
  signal?: AbortSignal;
  exposedTo?: readonly string[];
}

export interface ModelContext {
  registerTool(tool: WebMcpTool, options?: WebMcpRegisterOptions): Promise<void>;
  getTools(options?: { fromOrigins?: readonly string[] }): Promise<WebMcpTool[]>;
  executeTool(
    tool: WebMcpTool | string,
    input?: unknown,
    options?: WebMcpExecuteOptions,
  ): Promise<string>;
}

export interface ModelContextHost {
  modelContext?: ModelContext;
}
