import { ApiError, apiFetch } from '../../lib/api'
import { ProviderRequestError } from './types'
import type { ChatTurnResult, ConversationEntry, SendChatParams, ToolCallRequest, ToolDefinition } from './types'

export type ProviderId = 'anthropic' | 'openai' | 'deepseek'

export interface ProviderInfo {
  id: ProviderId
  label: string
  defaultModel: string
  modelHint: string
  keysUrl: string
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-sonnet-5',
    modelHint: 'e.g. claude-sonnet-5, claude-opus-5, claude-haiku-4-5-20251001',
    keysUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    label: 'OpenAI (GPT)',
    defaultModel: 'gpt-4o-mini',
    modelHint: 'e.g. gpt-4o-mini, gpt-4.1',
    keysUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    modelHint: 'e.g. deepseek-chat, deepseek-reasoner',
    keysUrl: 'https://platform.deepseek.com/api_keys',
  },
]

async function safeFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, credentials: 'omit' })
  } catch {
    throw new ProviderRequestError(
      "Couldn't reach the provider's API. The provider may block browser requests (CORS), " +
        'or there is a network problem or an invalid API key.',
    )
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json()
    return body?.error?.message ?? body?.message ?? `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

function toAnthropicMessages(conversation: SendChatParams['conversation']): Array<Record<string, unknown>> {
  return conversation.map((entry) => {
    if (entry.kind === 'user') {
      return { role: 'user', content: entry.content }
    }
    if (entry.kind === 'assistant') {
      const blocks: Array<Record<string, unknown>> = []
      if (entry.content) blocks.push({ type: 'text', text: entry.content })
      for (const call of entry.toolCalls) {
        blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.arguments })
      }
      return { role: 'assistant', content: blocks }
    }
    return {
      role: 'user',
      content: entry.results.map((r) => ({
        type: 'tool_result',
        tool_use_id: r.callId,
        content: r.output,
        is_error: r.isError,
      })),
    }
  })
}

async function sendAnthropicChat(params: SendChatParams): Promise<ChatTurnResult> {
  const response = await safeFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': params.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: 16000,
      system: params.systemPrompt,
      messages: toAnthropicMessages(params.conversation),
      tools: params.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
    }),
  })

  if (!response.ok) {
    throw new ProviderRequestError(await readErrorMessage(response))
  }

  const data = await response.json()
  const content: Array<Record<string, unknown>> = data.content ?? []
  const assistantText = content
    .filter((block) => block.type === 'text')
    .map((block) => block.text as string)
    .join('\n')
  const toolCalls: ToolCallRequest[] = content
    .filter((block) => block.type === 'tool_use')
    .map((block) => ({
      id: block.id as string,
      name: block.name as string,
      arguments: (block.input as Record<string, unknown>) ?? {},
    }))

  return { assistantText, toolCalls }
}

function toOpenAiMessages(conversation: SendChatParams['conversation']): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = []
  for (const entry of conversation) {
    if (entry.kind === 'user') {
      messages.push({ role: 'user', content: entry.content })
    } else if (entry.kind === 'assistant') {
      messages.push({
        role: 'assistant',
        content: entry.content || null,
        tool_calls:
          entry.toolCalls.length > 0
            ? entry.toolCalls.map((call) => ({
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: JSON.stringify(call.arguments) },
              }))
            : undefined,
      })
    } else {
      for (const r of entry.results) {
        messages.push({ role: 'tool', tool_call_id: r.callId, content: r.output })
      }
    }
  }
  return messages
}

function openAiCompatibleAdapter(baseUrl: string) {
  return async function sendChat(params: SendChatParams): Promise<ChatTurnResult> {
    const response = await safeFetch(baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: 16000,
        messages: [{ role: 'system', content: params.systemPrompt }, ...toOpenAiMessages(params.conversation)],
        tools: params.tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
        tool_choice: 'auto',
      }),
    })

    if (!response.ok) {
      throw new ProviderRequestError(await readErrorMessage(response))
    }

    const data = await response.json()
    const message = data.choices?.[0]?.message ?? {}
    const rawToolCalls: Array<Record<string, unknown>> = message.tool_calls ?? []
    const toolCalls: ToolCallRequest[] = rawToolCalls.map((call) => {
      const fn = call.function as { name: string; arguments: string }
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(fn.arguments || '{}')
      } catch {
        args = {}
      }
      return { id: call.id as string, name: fn.name, arguments: args }
    })

    return { assistantText: message.content ?? '', toolCalls }
  }
}

export const PROVIDER_ADAPTERS: Record<ProviderId, (params: SendChatParams) => Promise<ChatTurnResult>> = {
  anthropic: sendAnthropicChat,
  openai: openAiCompatibleAdapter('https://api.openai.com/v1/chat/completions'),
  deepseek: openAiCompatibleAdapter('https://api.deepseek.com/chat/completions'),
}

export function sendChat(providerId: ProviderId, params: SendChatParams): Promise<ChatTurnResult> {
  return PROVIDER_ADAPTERS[providerId](params)
}

export interface BackendChatParams {
  systemPrompt: string
  conversation: ConversationEntry[]
  tools: ToolDefinition[]
}

export async function sendChatViaBackend(params: BackendChatParams): Promise<ChatTurnResult> {
  try {
    return await apiFetch<ChatTurnResult>('/api/ai/chat/', {
      method: 'POST',
      body: JSON.stringify(params),
    })
  } catch (err) {
    if (err instanceof ApiError) {
      const detail = (err.body as { detail?: string } | null)?.detail
      throw new ProviderRequestError(detail ?? "The server's AI assistant couldn't process that request.")
    }
    throw new ProviderRequestError("Couldn't reach this app's server.")
  }
}
