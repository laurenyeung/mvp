import { Outlet } from 'react-router-dom'
import { useAuthStore } from '@/features/auth/store/authStore'
import MobileNav from './MobileNav.jsx'
import Sidebar from './Sidebar.jsx'
import { useMediaQuery } from '@/lib/useMediaQuery'

export default function AppShell() {
  const { user } = useAuthStore()
  const isMobile = useMediaQuery('(max-width: 768px)')
  const initials = `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`

  return (
    <div className="flex h-screen overflow-hidden bg-pixel-bg">
      {!isMobile && <Sidebar role={user?.role} />}
      <main className="flex-1 flex flex-col min-h-0 overflow-y-auto pb-safe md:pb-0">
        {isMobile && (
          <div className="flex items-center gap-3 px-4 py-3 border-b border-pixel-border bg-white shrink-0">
            <div className="w-8 h-8 rounded-full bg-pixel-accent flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-gray-900">{initials}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
                {user?.first_name} {user?.last_name}
              </p>
              <p className="text-xs text-gray-400 capitalize leading-tight">{user?.role?.toLowerCase()}</p>
            </div>
          </div>
        )}
        <Outlet />
      </main>
      {isMobile && <MobileNav role={user?.role} />}
    </div>
  )
}
