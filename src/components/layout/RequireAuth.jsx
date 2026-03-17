import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/features/auth/store/authStore'

export default function RequireAuth({ children }) {
  const { token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  return children
}
