import { useContext } from 'react'
import { AdminSessionContext, type AdminSessionState } from './adminSessionState'

export function useAdminSession(): AdminSessionState {
  const ctx = useContext(AdminSessionContext)
  if (!ctx) {
    throw new Error('useAdminSession must be used within AdminSessionProvider')
  }
  return ctx
}
