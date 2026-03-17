import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { loginSchema } from '@/lib/validationSchemas'
import { authApi } from '@/lib/api'
import { useAuthStore } from '../store/authStore'

export default function LoginPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data) => {
    setLoading(true)
    setError('')
    try {
      const res = await authApi.login(data)
      const { user, token } = res.data.data
      setAuth(user, token)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center mb-3 shadow-lg">
            <Zap size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">FitTrack</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your account</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                {...register('email')}
                type="email"
                placeholder="you@example.com"
                className="input"
                autoComplete="email"
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Password</label>
              <input
                {...register('password')}
                type="password"
                placeholder="••••••••"
                className="input"
                autoComplete="current-password"
              />
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-2"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          Don't have an account?{' '}
          <Link to="/register" className="text-brand-600 font-medium hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
