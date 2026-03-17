import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/features/auth/store/authStore'

export default function RoleRedirect() {
  const { user } = useAuthStore()
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'COACH') return <Navigate to="/coach/clients" replace />
  return <Navigate to="/client/today" replace />
}
