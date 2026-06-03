import { createContext } from 'react'
import type { StaffSessionPayload } from '../api/staffAdminSessionApi'

export interface AdminSessionState {
  session: StaffSessionPayload | null
  loading: boolean
  error: string | null
  reload: () => void
}

export const AdminSessionContext = createContext<AdminSessionState | null>(null)
