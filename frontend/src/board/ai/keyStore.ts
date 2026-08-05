import { decryptJson, encryptJson, WrongPassphraseError } from './crypto'
import type { EncryptedPayload } from './crypto'
import type { ProviderId } from './providers'

export interface StoredCredentials {
  provider: ProviderId
  apiKey: string
  model: string
}

const DB_NAME = 'task-tracker-ai-assistant'
const STORE_NAME = 'credentials'
const RECORD_KEY = 'default'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readPayload(): Promise<EncryptedPayload | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(RECORD_KEY)
    request.onsuccess = () => resolve((request.result as EncryptedPayload | undefined) ?? null)
    request.onerror = () => reject(request.error)
  })
}

async function writePayload(payload: EncryptedPayload | null): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    if (payload) {
      tx.objectStore(STORE_NAME).put(payload, RECORD_KEY)
    } else {
      tx.objectStore(STORE_NAME).delete(RECORD_KEY)
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

// Kept in JS memory so the passphrase doesn't need to be re-entered every time the AI assistant
// button remounts (it lives inside <Editor key={device}> and behind `editMode &&`, so switching
// device or leaving/re-entering edit mode both remount it). Also mirrored into sessionStorage --
// user-requested tradeoff: this means the decrypted key is readable from devtools for as long as
// the tab stays open, but it means a page reload during the same tab session no longer re-prompts
// for the passphrase either. Still cleared when the tab/window actually closes (sessionStorage's own
// lifetime), and "Forget this key" (clearCredentials) removes it immediately either way.
const SESSION_STORAGE_KEY = 'task-tracker:ai-session-credentials'
let sessionCredentials: StoredCredentials | null = readSessionStorageCredentials()

function readSessionStorageCredentials(): StoredCredentials | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredCredentials) : null
  } catch {
    return null
  }
}

function writeSessionStorageCredentials(credentials: StoredCredentials | null): void {
  try {
    if (credentials) sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(credentials))
    else sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // sessionStorage unavailable (e.g. private browsing quota) -- in-memory cache still works for this tab.
  }
}

export function getSessionCredentials(): StoredCredentials | null {
  return sessionCredentials
}

export async function hasStoredCredentials(): Promise<boolean> {
  return (await readPayload()) !== null
}

export async function saveCredentials(
  passphrase: string,
  credentials: StoredCredentials,
): Promise<void> {
  const payload = await encryptJson(credentials, passphrase)
  await writePayload(payload)
  sessionCredentials = credentials
  writeSessionStorageCredentials(credentials)
}

export async function unlockCredentials(passphrase: string): Promise<StoredCredentials> {
  const payload = await readPayload()
  if (!payload) throw new Error('No saved API key.')
  const credentials = await decryptJson<StoredCredentials>(payload, passphrase)
  sessionCredentials = credentials
  writeSessionStorageCredentials(credentials)
  return credentials
}

export async function clearCredentials(): Promise<void> {
  await writePayload(null)
  sessionCredentials = null
  writeSessionStorageCredentials(null)
}

export { WrongPassphraseError }
