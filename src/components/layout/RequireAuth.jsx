import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/features/auth/store/authStore'
import { authApi } from '@/lib/api'

export default function RequireAuth({ children }) {
  const { user, setAuth } = useAuthStore()
  // If user is already in persisted Zustand state, skip the /me call.
  // If not (e.g. first load after clearing store), verify the httpOnly cookie
  // by hitting /auth/me — if the cookie is valid we rehydrate; otherwise redirect.
  const [checking, setChecking] = useState(!user)

  useEffect(() => {
    if (user) return
    authApi.me()
      .then((res) => setAuth(res.data.data.user))
      .catch(() => {})
      .finally(() => setChecking(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) return null // brief flash-free wait
  if (!user) return <Navigate to="/login" replace />
  return children
}
