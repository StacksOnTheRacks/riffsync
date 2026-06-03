import { Navigate, Route, Routes } from 'react-router-dom'
import { SiteLayout } from './layouts/SiteLayout'
import { HomePage } from './pages/HomePage'
import { CatalogPage } from './pages/CatalogPage'
import { LobbyPage } from './pages/LobbyPage'
import { RoomPage } from './pages/RoomPage'
import { SoloWatchPage } from './pages/SoloWatchPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage'
import { TermsOfServicePage } from './pages/TermsOfServicePage'
import { DataRemovalRequestPage } from './pages/DataRemovalRequestPage'
import { HowToHostWatchPartyPage } from './pages/HowToHostWatchPartyPage'
import { StaffAuthCallbackPage } from './pages/admin/StaffAuthCallbackPage'
import { AdminLoginPage } from './pages/admin/AdminLoginPage'
import { AdminCatalogRoutePlaceholder } from './pages/admin/AdminCatalogRoutePlaceholder'
import { AdminHomePage } from './pages/admin/AdminHomePage'
import { StaffAdminGate } from './pages/admin/StaffAdminGate'
import { AdminLayout } from './layouts/AdminLayout'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/admin/auth/callback" element={<StaffAuthCallbackPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<StaffAdminGate />}>
        <Route element={<AdminLayout />}>
          <Route index element={<AdminHomePage />} />
          <Route path="catalog/new" element={<AdminCatalogRoutePlaceholder variant="new" />} />
          <Route path="catalog/:id/edit" element={<AdminCatalogRoutePlaceholder variant="edit" />} />
          <Route path="catalog" element={<AdminCatalogRoutePlaceholder variant="list" />} />
        </Route>
      </Route>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/watch/:catalogEpisodeId" element={<SoloWatchPage />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/how-to-host-a-watchparty" element={<HowToHostWatchPartyPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/privacy/data-removal" element={<DataRemovalRequestPage />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
