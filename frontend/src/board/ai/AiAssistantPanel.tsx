import { useEditor } from '@craftjs/core'
import type { SerializedNodes } from '@craftjs/core'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAnchoredPanel } from '../BoardCanvas'
import { useBoardUi } from '../BoardUiContext'
import { useAuth } from '../../context/AuthContext'
import type { ApplyContext, ApplyResult } from './applyToolCalls'
import { applyToolCall, describeToolCall } from './applyToolCalls'
import { summarizeBoardState } from './boardState'
import {
  clearCredentials,
  getSessionCredentials,
  hasStoredCredentials,
  saveCredentials,
  unlockCredentials,
  WrongPassphraseError,
} from './keyStore'
import type { StoredCredentials } from './keyStore'
import { clearConversationMemory, loadConversationMemory, saveConversationMemory } from './memory'
import { PROVIDERS, sendChat, sendChatViaBackend } from './providers'
import type { ProviderId } from './providers'
import { buildSystemPrompt } from './systemPrompt'
import { buildTools } from './tools'
import type { ConversationEntry, ToolCallRequest } from './types'
import { ProviderRequestError } from './types'

const PANEL_WIDTH = 340
const MAX_AGENT_STEPS = 24

type Screen = 'loading' | 'setup' | 'unlock' | 'chat'

function ForgetKeyConfirm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="ai-assistant-confirm-forget">
      <p className="confirm-popover-hint">Forget the saved key? You'll need to enter it again.</p>
      <div className="confirm-popover-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="confirm-popover-danger" onClick={onConfirm}>
          Forget
        </button>
      </div>
    </div>
  )
}

export function AiAssistantButton() {
  const { actions, query } = useEditor()
  const { background, headerStyle, setBackground, setHeaderStyle, canvasWidth, canvasHeight, device } =
    useBoardUi()
  const { aiAssistant, allowCustomScripts } = useAuth()
  const tools = buildTools(allowCustomScripts)
  const { anchor, toggleRef, toggle, close } = useAnchoredPanel(PANEL_WIDTH)

  const [screen, setScreen] = useState<Screen>('loading')
  const [credentials, setCredentials] = useState<StoredCredentials | null>(getSessionCredentials)
  const [confirmForget, setConfirmForget] = useState(false)

  const [setupProvider, setSetupProvider] = useState<ProviderId>(PROVIDERS[0].id)
  const [setupKey, setSetupKey] = useState('')
  const [setupModel, setSetupModel] = useState(PROVIDERS[0].defaultModel)
  const [setupPassphrase, setSetupPassphrase] = useState('')
  const [setupPassphraseConfirm, setSetupPassphraseConfirm] = useState('')
  const [setupError, setSetupError] = useState<string | null>(null)

  const [unlockPassphrase, setUnlockPassphrase] = useState('')
  const [unlockError, setUnlockError] = useState<string | null>(null)

  const [conversation, setConversation] = useState<ConversationEntry[]>(loadConversationMemory)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [running, setRunning] = useState(false)
  const [agentMode, setAgentMode] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const stopRequestedRef = useRef(false)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    saveConversationMemory(conversation)
  }, [conversation])

  useLayoutEffect(() => {
    if (screen !== 'chat' || !anchor) return
    const el = chatScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [screen, anchor, conversation, sending])

  function clearChat() {
    setConversation([])
    clearConversationMemory()
    setChatError(null)
  }

  function open() {
    if (!anchor && screen === 'loading') {
      if (aiAssistant.enabled || getSessionCredentials()) {
        setScreen('chat')
      } else {
        hasStoredCredentials()
          .then((yes) => setScreen(yes ? 'unlock' : 'setup'))
          .catch(() => setScreen('setup'))
      }
    }
    toggle()
  }

  function selectSetupProvider(id: ProviderId) {
    setSetupProvider(id)
    setSetupModel(PROVIDERS.find((p) => p.id === id)!.defaultModel)
  }

  function handleSaveSetup() {
    setSetupError(null)
    if (!setupKey.trim()) {
      setSetupError('Enter an API key.')
      return
    }
    if (setupPassphrase.length < 8) {
      setSetupError('Passphrase must be at least 8 characters.')
      return
    }
    if (setupPassphrase !== setupPassphraseConfirm) {
      setSetupError("Passphrases don't match.")
      return
    }
    const creds: StoredCredentials = {
      provider: setupProvider,
      apiKey: setupKey.trim(),
      model: setupModel.trim() || PROVIDERS.find((p) => p.id === setupProvider)!.defaultModel,
    }
    saveCredentials(setupPassphrase, creds)
      .then(() => {
        setCredentials(creds)
        setSetupKey('')
        setSetupPassphrase('')
        setSetupPassphraseConfirm('')
        setScreen('chat')
      })
      .catch(() => setSetupError('Could not save the key. Try again?'))
  }

  function handleUnlock() {
    setUnlockError(null)
    unlockCredentials(unlockPassphrase)
      .then((creds) => {
        setCredentials(creds)
        setUnlockPassphrase('')
        setScreen('chat')
      })
      .catch((err) => {
        setUnlockError(err instanceof WrongPassphraseError ? 'Wrong passphrase.' : 'Could not unlock.')
      })
  }

  function handleForget() {
    clearCredentials().then(() => {
      setCredentials(null)
      setConversation([])
      clearConversationMemory()
      setSetupKey('')
      setSetupPassphrase('')
      setSetupPassphraseConfirm('')
      selectSetupProvider(PROVIDERS[0].id)
      setConfirmForget(false)
      setScreen('setup')
    })
  }

  function runApplyBatch(toolCalls: ToolCallRequest[]): ApplyResult[] {
    let draftBackground = background
    let draftHeaderStyle = headerStyle
    const ctx: ApplyContext = {
      actions,
      query,
      canvasWidth,
      canvasHeight,
      allowCustomScripts,
      get background() {
        return draftBackground
      },
      get headerStyle() {
        return draftHeaderStyle
      },
      setBackground: (next) => {
        draftBackground = next
        setBackground(next)
      },
      setHeaderStyle: (next) => {
        draftHeaderStyle = next
        setHeaderStyle(next)
      },
    }
    return toolCalls.map((call) => applyToolCall(call, ctx))
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || sending || running || hasUnresolvedProposal) return
    if (!aiAssistant.enabled && !credentials) return

    setInput('')
    setChatError(null)
    stopRequestedRef.current = false

    let conv: ConversationEntry[] = [...conversation, { kind: 'user', content: text }]
    setConversation(conv)
    setSending(true)
    if (agentMode) setRunning(true)

    try {
      let step = 0
      let cappedOut = false
      while (step < MAX_AGENT_STEPS) {
        step++
        if (step > 1 && stopRequestedRef.current) break

        const layout = JSON.parse(query.serialize()) as SerializedNodes
        const boardState = summarizeBoardState(layout, device, background, headerStyle)
        const systemPrompt = buildSystemPrompt({
          allowCustomScripts,
          agentMode,
          boardStateJson: JSON.stringify(boardState),
          memoryNote:
            conv.length > 1
              ? 'Some of the conversation above may be restored from this browser\'s local storage ' +
                "(kept for up to 24 hours) rather than from this exact session -- treat it as real " +
                "prior context you already agreed to, not something to redo or re-explain."
              : '',
        })

        const result = aiAssistant.enabled
          ? await sendChatViaBackend({ systemPrompt, conversation: conv, tools })
          : await sendChat(credentials!.provider, {
              apiKey: credentials!.apiKey,
              model: credentials!.model,
              systemPrompt,
              conversation: conv,
              tools,
            })

        conv = [...conv, { kind: 'assistant', content: result.assistantText, toolCalls: result.toolCalls }]
        setConversation(conv)

        if (result.toolCalls.length === 0) break
        if (!agentMode) break

        const results = runApplyBatch(result.toolCalls)
        conv = [
          ...conv,
          {
            kind: 'tool_results',
            results: results.map((r) => ({
              callId: r.toolCall.id,
              name: r.toolCall.name,
              output: r.error ?? 'Done.',
              isError: Boolean(r.error),
            })),
          },
        ]
        setConversation(conv)

        if (step === MAX_AGENT_STEPS) cappedOut = true
      }
      if (cappedOut) {
        setChatError(
          `Paused after ${MAX_AGENT_STEPS} steps to avoid an unbounded loop -- the request may be only ` +
            'partly done. Just send another message (e.g. "continue") and it will keep going from here.',
        )
      }
    } catch (err) {
      setChatError(
        err instanceof ProviderRequestError ? err.message : 'Something went wrong talking to the provider.',
      )
    } finally {
      setSending(false)
      setRunning(false)
    }
  }

  function stopRun() {
    stopRequestedRef.current = true
  }

  function applyPendingEntry(entryIndex: number) {
    setConversation((prev) => {
      const entry = prev[entryIndex]
      if (!entry || entry.kind !== 'assistant' || entry.toolCalls.length === 0) return prev

      const results = runApplyBatch(entry.toolCalls)
      const next = [...prev]
      next.splice(entryIndex + 1, 0, {
        kind: 'tool_results',
        results: results.map((r) => ({
          callId: r.toolCall.id,
          name: r.toolCall.name,
          output: r.error ?? 'Done.',
          isError: Boolean(r.error),
        })),
      })
      return next
    })
  }

  function discardPendingEntry(entryIndex: number) {
    setConversation((prev) => {
      const entry = prev[entryIndex]
      if (!entry || entry.kind !== 'assistant') return prev
      const next = [...prev]
      next[entryIndex] = { ...entry, discarded: true }
      next.splice(entryIndex + 1, 0, {
        kind: 'tool_results',
        results: entry.toolCalls.map((call) => ({
          callId: call.id,
          name: call.name,
          output: 'The user chose not to apply this change.',
          isError: false,
        })),
      })
      return next
    })
  }

  const activeProviderInfo = PROVIDERS.find((p) => p.id === setupProvider)!
  const lastEntry = conversation[conversation.length - 1]
  const hasUnresolvedProposal =
    lastEntry?.kind === 'assistant' && lastEntry.toolCalls.length > 0 && !lastEntry.discarded
  const inputDisabled = sending || running || hasUnresolvedProposal

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="board-bg-toggle"
        onClick={open}
        aria-pressed={anchor != null}
        title="AI design assistant"
      >
        AI Assistant
      </button>
      {anchor &&
        createPortal(
          <>
            <div className="block-style-backdrop" onClick={close} />
            <div
              className="confirm-popover ai-assistant-popover"
              style={{ top: anchor.top, left: anchor.left, width: PANEL_WIDTH }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {screen === 'loading' && <p className="confirm-popover-hint">Loading...</p>}

              {screen === 'setup' && (
                <>
                  <p>Set up AI assistant</p>
                  <p className="confirm-popover-hint">
                    Your API key is encrypted with the passphrase below and stored only in this
                    browser -- this app's server never sees it.
                  </p>
                  <label className="ai-field-label">Provider</label>
                  <select
                    className="confirm-popover-input"
                    value={setupProvider}
                    onChange={(e) => selectSetupProvider(e.target.value as ProviderId)}
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <label className="ai-field-label">API key</label>
                  <input
                    type="password"
                    className="confirm-popover-input"
                    value={setupKey}
                    onChange={(e) => setSetupKey(e.target.value)}
                    placeholder="API key"
                    autoComplete="off"
                  />
                  <a
                    href={activeProviderInfo.keysUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="confirm-popover-hint ai-key-link"
                  >
                    Get an API key from {activeProviderInfo.label}
                  </a>
                  <label className="ai-field-label">Model</label>
                  <input
                    type="text"
                    className="confirm-popover-input"
                    value={setupModel}
                    onChange={(e) => setSetupModel(e.target.value)}
                  />
                  <p className="confirm-popover-hint">{activeProviderInfo.modelHint}</p>
                  <label className="ai-field-label">Passphrase</label>
                  <input
                    type="password"
                    className="confirm-popover-input"
                    value={setupPassphrase}
                    onChange={(e) => setSetupPassphrase(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                  <label className="ai-field-label">Confirm passphrase</label>
                  <input
                    type="password"
                    className="confirm-popover-input"
                    value={setupPassphraseConfirm}
                    onChange={(e) => setSetupPassphraseConfirm(e.target.value)}
                    autoComplete="new-password"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveSetup()
                    }}
                  />
                  {setupError && <p className="confirm-popover-hint">{setupError}</p>}
                  <div className="confirm-popover-actions">
                    <button type="button" onClick={close}>
                      Cancel
                    </button>
                    <button type="button" className="confirm-popover-primary" onClick={handleSaveSetup}>
                      Save
                    </button>
                  </div>
                </>
              )}

              {screen === 'unlock' && !confirmForget && (
                <>
                  <p>Unlock AI assistant</p>
                  <input
                    type="password"
                    className="confirm-popover-input"
                    value={unlockPassphrase}
                    onChange={(e) => setUnlockPassphrase(e.target.value)}
                    placeholder="Passphrase"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUnlock()
                    }}
                  />
                  {unlockError && <p className="confirm-popover-hint">{unlockError}</p>}
                  <div className="confirm-popover-actions">
                    <button type="button" className="ai-forget-link" onClick={() => setConfirmForget(true)}>
                      Forget key
                    </button>
                    <button type="button" onClick={close}>
                      Cancel
                    </button>
                    <button type="button" className="confirm-popover-primary" onClick={handleUnlock}>
                      Unlock
                    </button>
                  </div>
                </>
              )}

              {screen === 'unlock' && confirmForget && (
                <ForgetKeyConfirm onCancel={() => setConfirmForget(false)} onConfirm={handleForget} />
              )}

              {screen === 'chat' && !confirmForget && (
                <div className="ai-assistant-chat">
                  <div className="ai-assistant-chat-header">
                    <span>AI Assistant</span>
                    <div className="ai-assistant-chat-header-actions">
                      {conversation.length > 0 && (
                        <button
                          type="button"
                          className="ai-forget-link"
                          onClick={clearChat}
                          disabled={sending || running}
                        >
                          Clear chat
                        </button>
                      )}
                      {!aiAssistant.enabled && (
                        <button type="button" className="ai-forget-link" onClick={() => setConfirmForget(true)}>
                          Change key
                        </button>
                      )}
                    </div>
                  </div>
                  {aiAssistant.enabled && (
                    <p className="confirm-popover-hint">
                      Using this server's shared {aiAssistant.provider} key -- no key of your own needed.
                    </p>
                  )}
                  <p className="confirm-popover-hint ai-memory-note">
                    Chat history is kept in this browser for 24 hours (not sent anywhere extra), then
                    cleared automatically -- use "Clear chat" to reset it sooner.
                  </p>
                  <label className="ai-agent-mode-row">
                    <input
                      type="checkbox"
                      checked={agentMode}
                      disabled={running}
                      onChange={(e) => setAgentMode(e.target.checked)}
                    />
                    Agent mode -- run multiple steps and apply automatically
                  </label>
                  <div className="ai-chat-scroll" ref={chatScrollRef}>
                    {conversation.length === 0 && (
                      <p className="confirm-popover-hint">
                        Describe a change, e.g. "make the background a soft blue" or "add a note
                        block in the top right". Turn on agent mode for multi-step requests like
                        "add a note for each day of the week".
                      </p>
                    )}
                    {conversation.map((entry, idx) => {
                      if (entry.kind === 'tool_results') return null
                      const roleClass = entry.kind === 'user' ? 'user' : 'assistant'
                      const resultsEntry = conversation[idx + 1]
                      const results = resultsEntry?.kind === 'tool_results' ? resultsEntry.results : null
                      const hasToolCalls = entry.kind === 'assistant' && entry.toolCalls.length > 0
                      return (
                        <div key={idx} className={`ai-chat-turn ai-chat-turn-${roleClass}`}>
                          {entry.content && <p>{entry.content}</p>}
                          {hasToolCalls && entry.kind === 'assistant' && !results && !entry.discarded && (
                            <div className="ai-chat-proposed">
                              <p className="confirm-popover-hint">Proposed changes:</p>
                              <ul>
                                {entry.toolCalls.map((call, i) => (
                                  <li key={i}>{describeToolCall(call)}</li>
                                ))}
                              </ul>
                              <div className="confirm-popover-actions">
                                <button type="button" onClick={() => discardPendingEntry(idx)}>
                                  Discard
                                </button>
                                <button
                                  type="button"
                                  className="confirm-popover-primary"
                                  onClick={() => applyPendingEntry(idx)}
                                >
                                  Apply
                                </button>
                              </div>
                            </div>
                          )}
                          {hasToolCalls && entry.kind === 'assistant' && entry.discarded && (
                            <p className="confirm-popover-hint">Changes discarded.</p>
                          )}
                          {hasToolCalls && entry.kind === 'assistant' && !entry.discarded && results && (
                            <ul className="ai-chat-applied">
                              {entry.toolCalls.map((call, i) => {
                                const result = results.find((r) => r.callId === call.id) ?? results[i]
                                return (
                                  <li
                                    key={i}
                                    className={result?.isError ? 'ai-chat-applied-error' : 'ai-chat-applied-ok'}
                                  >
                                    {result?.isError
                                      ? `Failed -- ${describeToolCall(call)} (${result.output})`
                                      : describeToolCall(call)}
                                  </li>
                                )
                              })}
                            </ul>
                          )}
                        </div>
                      )
                    })}
                    {sending && <p className="confirm-popover-hint">{running ? 'Working...' : 'Thinking...'}</p>}
                    {chatError && <p className="confirm-popover-hint">{chatError}</p>}
                  </div>
                  {hasUnresolvedProposal && (
                    <p className="confirm-popover-hint">Apply or discard the proposed changes above to continue.</p>
                  )}
                  <div className="ai-chat-input-row">
                    <input
                      type="text"
                      className="confirm-popover-input"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Describe a change..."
                      disabled={inputDisabled}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSend()
                      }}
                    />
                    {running ? (
                      <button type="button" className="confirm-popover-danger" onClick={stopRun}>
                        Stop
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="confirm-popover-primary"
                        onClick={handleSend}
                        disabled={inputDisabled || !input.trim()}
                      >
                        Send
                      </button>
                    )}
                  </div>
                  <div className="confirm-popover-actions">
                    <button type="button" onClick={close}>
                      Close
                    </button>
                  </div>
                </div>
              )}

              {screen === 'chat' && confirmForget && (
                <ForgetKeyConfirm onCancel={() => setConfirmForget(false)} onConfirm={handleForget} />
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
