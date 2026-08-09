import { Navigate, Route, Routes } from 'react-router-dom'
import { SiteLayout } from './layouts/SiteLayout'
import { HomePage } from './pages/HomePage'
import { CatalogPage } from './pages/CatalogPage'
import { CatalogSubcategoryPage } from './pages/CatalogSubcategoryPage'
import { LobbyPage } from './pages/LobbyPage'
import { LiveChannelPage } from './pages/LiveChannelPage'
import { AccountPage } from './pages/AccountPage'
import { RoomPage } from './pages/RoomPage'
import { CastReceiverPage } from './pages/cast/CastReceiverPage'
import { TvClientPage } from './pages/tv/TvClientPage'
import { SoloWatchPage } from './pages/SoloWatchPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage'
import { TermsOfServicePage } from './pages/TermsOfServicePage'
import { DataRemovalRequestPage } from './pages/DataRemovalRequestPage'
import { HowToHostWatchPartyPage } from './pages/HowToHostWatchPartyPage'
import { DownloadAppPage } from './pages/DownloadAppPage'
import { StaffAuthCallbackPage } from './pages/admin/StaffAuthCallbackPage'
import { AdminLoginPage } from './pages/admin/AdminLoginPage'
import { AdminCatalogCreatePage } from './pages/admin/AdminCatalogCreatePage'
import { AdminCatalogEditPage } from './pages/admin/AdminCatalogEditPage'
import { AdminCatalogListPage } from './pages/admin/AdminCatalogListPage'
import { AdminEmailPage } from './pages/admin/AdminEmailPage'
import { AdminHomePage } from './pages/admin/AdminHomePage'
import { StaffAdminGate } from './pages/admin/StaffAdminGate'
import { AdminLayout } from './layouts/AdminLayout'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/admin/auth/callback" element={<StaffAuthCallbackPage />} />
      <Route path="/cast/receiver" element={<CastReceiverPage />} />
      <Route path="/tv" element={<TvClientPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<StaffAdminGate />}>
        <Route element={<AdminLayout />}>
          <Route index element={<AdminHomePage />} />
          <Route path="catalog/new" element={<AdminCatalogCreatePage />} />
          <Route path="catalog/:id/edit" element={<AdminCatalogEditPage />} />
          <Route path="catalog" element={<AdminCatalogListPage />} />
          <Route path="email" element={<AdminEmailPage />} />
        </Route>
      </Route>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/catalog/mst3k" element={<CatalogSubcategoryPage />} />
        <Route path="/catalog/mst3k/season/:seasonNumber" element={<CatalogSubcategoryPage />} />
        <Route path="/catalog/mst3k/era/:eraSlug" element={<CatalogSubcategoryPage />} />
        <Route path="/catalog/mst3k/shorts" element={<CatalogSubcategoryPage />} />
        <Route path="/catalog/community" element={<CatalogSubcategoryPage />} />
        <Route path="/catalog/riff-ready" element={<Navigate to="/catalog/riff-material" replace />} />
        <Route path="/catalog/riff-material" element={<CatalogSubcategoryPage />} />
        <Route path="/catalog/movie-night" element={<Navigate to="/catalog" replace />} />
        <Route path="/watch/:catalogEpisodeId" element={<SoloWatchPage />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/live/:slug" element={<LiveChannelPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/download" element={<DownloadAppPage />} />
        <Route path="/how-to-host-a-watchparty" element={<HowToHostWatchPartyPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/privacy/data-removal" element={<DataRemovalRequestPage />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
        <Route path="/room/:roomId/experimental/:experimental" element={<RoomPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
