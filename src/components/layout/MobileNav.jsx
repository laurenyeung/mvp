import { NavLink } from 'react-router-dom'
import { Users, Dumbbell, MessageCircle, LayoutTemplate, Calendar, TrendingUp, History } from 'lucide-react'
import { cn } from '@/lib/utils'

const coachNav = [
  { to: '/coach/clients', icon: Users, label: 'Clients' },
  { to: '/coach/templates', icon: LayoutTemplate, label: 'Templates' },
  { to: '/exercises', icon: Dumbbell, label: 'Exercises' },
  { to: '/messages', icon: MessageCircle, label: 'Messages' },
]

const clientNav = [
  { to: '/client/today', icon: Calendar, label: 'Today' },
  { to: '/client/history', icon: History, label: 'History' },
  { to: '/client/progress', icon: TrendingUp, label: 'Progress' },
  { to: '/exercises', icon: Dumbbell, label: 'Exercises' },
  { to: '/messages', icon: MessageCircle, label: 'Messages' },
]

export default function MobileNav({ role }) {
  const items = role === 'COACH' ? coachNav : clientNav
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom">
      <div className="flex items-stretch justify-around h-16">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center flex-1 gap-0.5 text-xs transition-colors',
                isActive ? 'text-brand-600' : 'text-gray-400'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />
                <span className="font-medium">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
