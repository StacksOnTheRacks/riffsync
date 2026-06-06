import { StrictMode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './styles/riffsync-app.css'
import { FanSessionKeepAlive } from './auth/FanSessionKeepAlive'
import { ScrollToTop } from './components/ScrollToTop'
import { AppRoutes } from './AppRoutes.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ScrollToTop />
        <FanSessionKeepAlive />
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
