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

const SESSION_STORAGE_KEY = 'task-tracker:ai-session-credentials'
const REMEMBER_ACROSS_RELOAD_KEY = 'task-tracker:ai-remember-across-reload'

export function getRememberAcrossReload(): boolean {
  try {
    return localStorage.getItem(REMEMBER_ACROSS_RELOAD_KEY) === 'true'
  } catch {
    return false
  }
}

export function setRememberAcrossReload(value: boolean): void {
  try {
    if (value) localStorage.setItem(REMEMBER_ACROSS_RELOAD_KEY, 'true')
    else localStorage.removeItem(REMEMBER_ACROSS_RELOAD_KEY)
  } catch {}
  if (!value) writeSessionStorageCredentials(null)
}

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
  } catch {}
}

let sessionCredentials: StoredCredentials | null = getRememberAcrossReload()
  ? readSessionStorageCredentials()
  : null

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
  if (getRememberAcrossReload()) writeSessionStorageCredentials(credentials)
}

export async function unlockCredentials(passphrase: string): Promise<StoredCredentials> {
  const payload = await readPayload()
  if (!payload) throw new Error('No saved API key.')
  const credentials = await decryptJson<StoredCredentials>(payload, passphrase)
  sessionCredentials = credentials
  if (getRememberAcrossReload()) writeSessionStorageCredentials(credentials)
  return credentials
}

export async function clearCredentials(): Promise<void> {
  await writePayload(null)
  sessionCredentials = null
  writeSessionStorageCredentials(null)
}

export { WrongPassphraseError }
