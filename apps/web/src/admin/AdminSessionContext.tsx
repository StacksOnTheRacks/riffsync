import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { refreshStaffTokensIfStale } from '../auth/staffHostedUiPkce'
import { getStaffAccessToken } from '../auth/staffTokens'
import {
  fetchStaffSession,
  StaffSessionForbiddenError,
  StaffSessionUnauthorizedError,
  type StaffSessionPayload,
} from '../api/staffAdminSessionApi'

export interface AdminSessionState {
  session: StaffSessionPayload | null
  loading: boolean
  error: string | null
  reload: () => void
}

const AdminSessionContext = createContext<AdminSessionState | null>(null)

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [session, setSession] = useState<StaffSessionPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)

  const reload = useCallback(() => {
    setReloadToken((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        await refreshStaffTokensIfStale()
        const token = getStaffAccessToken()
        if (!token) {
          if (!cancelled) navigate('/admin/login', { replace: true })
          return
        }
        const payload = await fetchStaffSession(token)
        if (!cancelled) setSession(payload)
      } catch (e: unknown) {
        if (cancelled) return
        setSession(null)
        if (e instanceof StaffSessionUnauthorizedError || e instanceof StaffSessionForbiddenError) {
          setError(e.message)
        } else {
          setError(e instanceof Error ? e.message : 'Could not load operator session')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [navigate, reloadToken])

  const value = useMemo(
    () => ({ session, loading, error, reload }),
    [session, loading, error, reload],
  )

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>
}

export function useAdminSession(): AdminSessionState {
  const ctx = useContext(AdminSessionContext)
  if (!ctx) {
    throw new Error('useAdminSession must be used within AdminSessionProvider')
  }
  return ctx
}

/** Visible label for Cognito groups in the session strip (abbreviated when long). */
export function abbreviateStaffGroups(groups: string[]): string {
  if (groups.length === 0) return '(none)'
  if (groups.length <= 2) return groups.join(', ')
  const shown = groups.slice(0, 2).join(', ')
  const rest = groups.length - 2
  return `${shown} (+${rest})`
}
