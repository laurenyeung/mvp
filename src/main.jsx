import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import { queryClient } from './app/queryClient.js'
import { api, setCsrfToken } from './lib/api.js'
import ErrorBoundary from './components/layout/ErrorBoundary.jsx'
import './index.css'

// Fetch CSRF token on app load and refresh every 4 min (tiny-csrf tokens expire in 5 min).
function refreshCsrfToken() {
  api.get('/csrf-token').then(r => setCsrfToken(r.data.csrfToken)).catch(() => { /* non-blocking */ })
}
refreshCsrfToken()
setInterval(refreshCsrfToken, 4 * 60 * 1000)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
