import { NavLink, useNavigate } from 'react-router-dom'
import { Users, Dumbbell, MessageCircle, LayoutTemplate, Calendar, TrendingUp, History, LogOut, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/features/auth/store/authStore'

const coachNav = [
  { to: '/coach/clients', icon: Users, label: 'Clients' },
  { to: '/coach/templates', icon: LayoutTemplate, label: 'Templates' },
  { to: '/exercises', icon: Dumbbell, label: 'Exercises' },
  { to: '/messages', icon: MessageCircle, label: 'Messages' },
]

const clientNav = [
  { to: '/client/today', icon: Calendar, label: "Today's Workout" },
  { to: '/client/history', icon: History, label: 'History' },
  { to: '/client/progress', icon: TrendingUp, label: 'Progress' },
  { to: '/exercises', icon: Dumbbell, label: 'Exercises' },
  { to: '/messages', icon: MessageCircle, label: 'Messages' },
]

export default function Sidebar({ role }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const items = role === 'COACH' ? coachNav : clientNav

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside className="w-60 shrink-0 bg-white border-r border-gray-100 flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-100">
        <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center">
          <Zap size={16} className="text-white" />
        </div>
        <span className="font-bold text-gray-900 text-base">FitTrack</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} strokeWidth={isActive ? 2.2 : 1.8} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User + Logout */}
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-semibold text-xs">
            {user?.first_name?.[0]}{user?.last_name?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user?.first_name} {user?.last_name}
            </p>
            <p className="text-xs text-gray-400 truncate capitalize">
              {user?.role?.toLowerCase()}
            </p>
          </div>
        </div>
        <button onClick={handleLogout} className="btn-ghost w-full justify-start gap-2 text-gray-500">
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
