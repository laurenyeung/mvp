import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Dumbbell, Users } from 'lucide-react'
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
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-pixel-bg">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-pixel-accent mb-4">
            <span className="text-lg font-black text-gray-900">LI</span>
          </div>
          <h1 className="text-2xl font-black text-gray-900">Create Account</h1>
          <p className="mt-1 text-sm text-gray-500">Join LockedIn today</p>
        </div>

        {/* Form */}
        <div className="bg-white rounded-xl shadow-card border border-pixel-border p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* Role selector */}
            <div>
              <label className="label">I am a</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'CLIENT', icon: Dumbbell, label: 'Athlete' },
                  { value: 'COACH', icon: Users, label: 'Coach' },
                ].map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setValue('role', value)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 py-3 rounded border-2 text-sm font-semibold transition-all',
                      role === value
                        ? 'border-pixel-accent bg-brand-50 text-pixel-dim'
                        : 'border-pixel-border text-gray-500 hover:border-pixel-line'
                    )}
                  >
                    <Icon size={20} strokeWidth={role === value ? 2 : 1.5} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
              <div>
                <label className="label">First Name</label>
                <input {...register('first_name')} className="input" placeholder="Alex" />
                {errors.first_name && (
                  <p className="mt-1 text-xs text-red-600">{errors.first_name.message}</p>
                )}
              </div>
              <div>
                <label className="label">Last Name</label>
                <input {...register('last_name')} className="input" placeholder="Smith" />
                {errors.last_name && (
                  <p className="mt-1 text-xs text-red-600">{errors.last_name.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="label">Email</label>
              <input {...register('email')} type="email" className="input" placeholder="you@example.com" />
              {errors.email && (
                <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="label">Password</label>
              <input {...register('password')} type="password" className="input" placeholder="Min 8 characters" />
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>

            {error && (
              <div className="rounded bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center mt-5 text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-pixel-dim hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
