import { apiFetch } from '../lib/api'
import type { BoardDesignExport } from './boardExport'

export interface SavedDesignSummary {
  id: number
  name: string
  design: BoardDesignExport
  created_at: string
}

export function listSavedDesigns(): Promise<SavedDesignSummary[]> {
  return apiFetch<SavedDesignSummary[]>('/api/designs/')
}

export function createSavedDesign(name: string, design: BoardDesignExport): Promise<SavedDesignSummary> {
  return apiFetch<SavedDesignSummary>('/api/designs/', {
    method: 'POST',
    body: JSON.stringify({ name, design }),
  })
}

export function deleteSavedDesign(id: number): Promise<void> {
  return apiFetch<void>(`/api/designs/${id}/`, { method: 'DELETE' })
}

export function applySavedDesign(id: number): Promise<BoardDesignExport> {
  return apiFetch<BoardDesignExport>(`/api/designs/${id}/use/`, { method: 'POST' })
}
