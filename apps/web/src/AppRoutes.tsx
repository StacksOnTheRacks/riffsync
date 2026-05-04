import { Navigate, Route, Routes } from 'react-router-dom'
import { SiteLayout } from './layouts/SiteLayout'
import { HomePage } from './pages/HomePage'
import { CatalogPage } from './pages/CatalogPage'
import { LobbyPage } from './pages/LobbyPage'
import { RoomPage } from './pages/RoomPage'
import { AdminShellPage } from './pages/AdminShellPage'
import { SoloWatchPage } from './pages/SoloWatchPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage'
import { TermsOfServicePage } from './pages/TermsOfServicePage'
import { DataRemovalRequestPage } from './pages/DataRemovalRequestPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route element={<SiteLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/watch/:catalogEpisodeId" element={<SoloWatchPage />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/privacy/data-removal" element={<DataRemovalRequestPage />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
        <Route path="/admin/*" element={<AdminShellPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
