export interface Options {
  cwd: string;
  harness: string;
  command?: string;
  prompt?: string;
  context?: string;
  model?: string;
  effort?: string;
  variant?: string;
  preference?: string;
  session?: string;
  sandbox?: string;
  agent?: string;
  policy?: string;
  layout?: string;
  output?: string;
  json?: boolean;
  ephemeral?: boolean;
  inline?: boolean;
  background?: boolean;
  cached?: boolean;
}
export interface Route {
  model: string;
  effort?: string;
  variant?: string;
  source: string;
  errorType?: string;
  candidateCount?: number;
  [key: string]: unknown;
}
export interface CatalogModel {
  id: string;
  name?: string;
  status?: string;
  releaseDate?: string;
  toolcall: boolean;
  context?: number;
  inputCost?: number;
  outputCost?: number;
  variants: string[];
}
interface PolicyEntry {
  key: string;
  models: string[];
  description: string;
  enabled?: boolean;
  disabledReason?: string;
  variant?: string;
  evidence?: string;
  sources?: string[];
}
export interface Policy {
  candidates: PolicyEntry[];
  fallback: string;
  reviewedAt: string;
  defaultPreference?: string;
}
export type RoutingClient = Pick<import('@typesafe-ai/sdk').TypeSafeClient, 'systemOne'>;
export interface RoutingOptions { prompt?: string; context?: string; model?: string; effort?: string; variant?: string; preference?: string }
export interface ProviderModel {
  name?: string; status?: string; release_date?: string; tool_call?: boolean;
  capabilities?: { toolcall?: boolean };
  limit?: { context?: number };
  cost?: { input?: number; output?: number };
  variants?: Record<string, { disabled?: boolean }>;
}
interface Part { type: string; text: string; synthetic?: boolean; ignored?: boolean; id?: string; sessionID?: string; messageID?: string }
export interface ChatOutput {
  parts: Part[];
  message: { id: string; model?: { providerID: string; modelID: string; variant?: string } };
}
export interface PluginClient {
  tui: { showToast(request: { body: { title: string; message: string; variant: string; duration: number } }): Promise<unknown> };
  config: { providers(request: object): Promise<{ error?: unknown; data?: { providers: { id: string; models?: Record<string, ProviderModel> }[] } }> };
  session: { messages(request: object): Promise<{ error?: unknown; data?: { info: { id: string; role: string }; parts: Part[] }[] }> };
  app: { log(request: object): Promise<unknown> };
}
export interface RpcTurn { id: string; status: string; [key: string]: unknown }
export interface RpcParams { threadId?: string; turn?: RpcTurn; [key: string]: unknown }
export interface RpcMessage { id?: number; method?: string; params?: RpcParams; result?: unknown; error?: {code: number} }
