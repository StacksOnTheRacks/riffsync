import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../index.css'
import '../../styles/riffsync-app.css'
import { CastReceiverPage } from './CastReceiverPage'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Cast receiver root element is missing')
}

createRoot(root).render(
  <StrictMode>
    <CastReceiverPage />
  </StrictMode>,
)
