import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { apiFetch } from '../lib/api'

export interface User {
  id: number
  username: string
  email: string
}

interface AuthContextValue {
  user: User | null
  loading: boolean
  registrationOpen: boolean
  allowCustomScripts: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, email?: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [registrationOpen, setRegistrationOpen] = useState(true)
  const [allowCustomScripts, setAllowCustomScripts] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const status = await apiFetch<{
          registration_open: boolean
          allow_custom_scripts: boolean
        }>('/api/auth/registration-status/')
        if (!cancelled) {
          setRegistrationOpen(status.registration_open)
          setAllowCustomScripts(status.allow_custom_scripts)
        }
      } catch {
      }

      try {
        const me = await apiFetch<User>('/api/auth/me/')
        if (!cancelled) setUser(me)
      } catch {
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  async function login(username: string, password: string) {
    const me = await apiFetch<User>('/api/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
    setUser(me)
  }

  async function register(username: string, password: string, email?: string) {
    const me = await apiFetch<User>('/api/auth/register/', {
      method: 'POST',
      body: JSON.stringify({ username, password, email }),
    })
    setUser(me)
  }

  async function logout() {
    try {
      await apiFetch('/api/auth/logout/', { method: 'POST' })
    } finally {
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, registrationOpen, allowCustomScripts, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
