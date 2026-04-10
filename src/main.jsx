import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.jsx'
import { queryClient } from './app/queryClient.js'
import { api } from './lib/api.js'
import ErrorBoundary from './components/layout/ErrorBoundary.jsx'
import './index.css'

// Seed the CSRF cookie so the request interceptor can attach it on mutating calls.
api.get('/csrf-token').catch(() => { /* non-blocking — app still works if this fails */ })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
