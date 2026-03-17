import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Zap, Dumbbell, Users } from 'lucide-react'
import { registerSchema } from '@/lib/validationSchemas'
import { authApi } from '@/lib/api'
import { useAuthStore } from '../store/authStore'
import { cn } from '@/lib/utils'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: 'CLIENT' },
  })

  const role = watch('role')

  const onSubmit = async (data) => {
    setLoading(true)
    setError('')
    try {
      const res = await authApi.register(data)
      const { user, token } = res.data.data
      setAuth(user, token)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center mb-3 shadow-lg">
            <Zap size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
          <p className="text-gray-500 text-sm mt-1">Join FitTrack today</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Role selector */}
            <div>
              <label className="label">I am a…</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'CLIENT', icon: Dumbbell, label: 'Client' },
                  { value: 'COACH', icon: Users, label: 'Coach' },
                ].map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setValue('role', value)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-sm font-medium transition-all',
                      role === value
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    )}
                  >
                    <Icon size={20} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">First Name</label>
                <input {...register('first_name')} className="input" placeholder="Alex" />
                {errors.first_name && <p className="text-red-500 text-xs mt-1">{errors.first_name.message}</p>}
              </div>
              <div>
                <label className="label">Last Name</label>
                <input {...register('last_name')} className="input" placeholder="Smith" />
                {errors.last_name && <p className="text-red-500 text-xs mt-1">{errors.last_name.message}</p>}
              </div>
            </div>

            <div>
              <label className="label">Email</label>
              <input {...register('email')} type="email" className="input" placeholder="you@example.com" />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="label">Password</label>
              <input {...register('password')} type="password" className="input" placeholder="Min 8 characters" />
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-600 font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
