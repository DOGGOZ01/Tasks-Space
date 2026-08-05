import type { ConversationEntry } from './types'

const MEMORY_KEY = 'task-tracker:ai-conversation-memory'
export const MEMORY_TTL_MS = 24 * 60 * 60 * 1000

interface StoredMemory {
  savedAt: number
  conversation: ConversationEntry[]
}

export function loadConversationMemory(): ConversationEntry[] {
  try {
    const raw = localStorage.getItem(MEMORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredMemory
    if (!parsed || typeof parsed.savedAt !== 'number' || !Array.isArray(parsed.conversation)) return []
    if (Date.now() - parsed.savedAt > MEMORY_TTL_MS) {
      localStorage.removeItem(MEMORY_KEY)
      return []
    }
    return parsed.conversation
  } catch {
    return []
  }
}

export function saveConversationMemory(conversation: ConversationEntry[]): void {
  try {
    if (conversation.length === 0) {
      localStorage.removeItem(MEMORY_KEY)
      return
    }
    const payload: StoredMemory = { savedAt: Date.now(), conversation }
    localStorage.setItem(MEMORY_KEY, JSON.stringify(payload))
  } catch {}
}

export function clearConversationMemory(): void {
  try {
    localStorage.removeItem(MEMORY_KEY)
  } catch {}
}
