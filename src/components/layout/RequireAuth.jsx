import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/features/auth/store/authStore'
import { authApi } from '@/lib/api'

export default function RequireAuth({ children }) {
  const { user, setAuth } = useAuthStore()
  // Always verify the httpOnly cookie via /auth/me on first mount — even when
  // user is already in Zustand. This prevents a race condition on iOS WebKit
  // where the cookie isn't yet available to XHR immediately after login,
  // causing protected API calls to 401 and boot the user back to login.
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    authApi.me()
      .then((res) => setAuth(res.data.data.user))
      .catch(() => {})
      .finally(() => setChecking(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) return null
  if (!user) return <Navigate to="/login" replace />
  return children
}
