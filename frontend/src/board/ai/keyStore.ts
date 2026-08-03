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

export async function hasStoredCredentials(): Promise<boolean> {
  return (await readPayload()) !== null
}

export async function saveCredentials(
  passphrase: string,
  credentials: StoredCredentials,
): Promise<void> {
  const payload = await encryptJson(credentials, passphrase)
  await writePayload(payload)
}

export async function unlockCredentials(passphrase: string): Promise<StoredCredentials> {
  const payload = await readPayload()
  if (!payload) throw new Error('No saved API key.')
  return decryptJson<StoredCredentials>(payload, passphrase)
}

export async function clearCredentials(): Promise<void> {
  await writePayload(null)
}

export { WrongPassphraseError }
