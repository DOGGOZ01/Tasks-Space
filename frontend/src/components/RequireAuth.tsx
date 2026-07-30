import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) return <div className="page-loading">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}
