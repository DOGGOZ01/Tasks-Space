export interface ToolCallRequest {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface ToolResultEntry {
  callId: string
  name: string
  output: string
  isError: boolean
}

export type ConversationEntry =
  | { kind: 'user'; content: string }
  | { kind: 'assistant'; content: string; toolCalls: ToolCallRequest[]; discarded?: boolean }
  | { kind: 'tool_results'; results: ToolResultEntry[] }

export interface ChatTurnResult {
  assistantText: string
  toolCalls: ToolCallRequest[]
}

export interface JsonSchema {
  type: string
  properties?: Record<string, JsonSchema | { type: string; enum?: string[]; description?: string }>
  required?: string[]
  description?: string
  enum?: string[]
  items?: JsonSchema
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: JsonSchema
}

export interface SendChatParams {
  apiKey: string
  model: string
  systemPrompt: string
  conversation: ConversationEntry[]
  tools: ToolDefinition[]
}

export class ProviderRequestError extends Error {}
