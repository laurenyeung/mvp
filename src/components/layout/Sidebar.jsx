import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Users, Dumbbell, LayoutTemplate, Calendar, History, LogOut } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/features/auth/store/authStore'
import { authApi } from '@/lib/api'

const coachNav = [
  { to: '/coach/clients', icon: Users, label: 'Clients' },
  { to: '/coach/templates', icon: LayoutTemplate, label: 'Templates' },
  { to: '/exercises', icon: Dumbbell, label: 'Exercises' },
]

const clientNav = [
  { to: '/client/today', icon: Calendar, label: 'Upcoming' },
  { to: '/client/history', icon: History, label: 'History' },
  { to: '/exercises', icon: Dumbbell, label: 'Exercises' },
]

export default function Sidebar({ role }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const items = role === 'COACH' ? coachNav : clientNav
  const [confirming, setConfirming] = useState(false)

  const handleLogout = async () => {
    try { await authApi.logout() } catch { /* server may be unreachable; clear locally anyway */ }
    logout()
    qc.clear()
    navigate('/login')
  }

  const initials = `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`

  return (
    <aside className="w-60 shrink-0 flex flex-col h-full border-r border-pixel-border bg-white">

      {/* ── Logo ── */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-pixel-border">
        <div className="w-8 h-8 rounded bg-pixel-accent flex items-center justify-center shrink-0">
          <span className="text-xs font-black text-gray-900 tracking-tight">LI</span>
        </div>
        <span className="text-base font-black text-gray-900 tracking-tight">LockedIn</span>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-pixel-dim'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={17} strokeWidth={isActive ? 2 : 1.5} className={isActive ? 'text-pixel-accent' : ''} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── User + Logout ── */}
      <div className="p-4 border-t border-pixel-border">
        <div className="flex items-center gap-3 mb-3 px-1">
          <div className="w-8 h-8 rounded-full bg-pixel-accent flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-gray-900">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="text-xs text-gray-400 capitalize truncate">{user?.role?.toLowerCase()}</p>
          </div>
        </div>
        <button
          onClick={() => setConfirming(true)}
          className="btn-ghost w-full justify-start gap-2 text-sm"
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-xs p-6 shadow-card-hover">
            <p className="text-base font-semibold text-gray-900 text-center mb-1">Sign out?</p>
            <p className="text-sm text-gray-400 text-center mb-5">You'll need to log back in to access your account.</p>
            <div className="flex flex-col gap-2">
              <button onClick={handleLogout} className="btn-primary w-full py-2.5">Sign out</button>
              <button onClick={() => setConfirming(false)} className="btn-ghost w-full py-2.5">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
