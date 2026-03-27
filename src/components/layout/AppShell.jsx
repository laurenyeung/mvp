import { Outlet } from 'react-router-dom'
import { useAuthStore } from '@/features/auth/store/authStore'
import MobileNav from './MobileNav.jsx'
import Sidebar from './Sidebar.jsx'
import { useMediaQuery } from '@/lib/useMediaQuery'

export default function AppShell() {
  const { user } = useAuthStore()
  const isMobile = useMediaQuery('(max-width: 768px)')

  return (
    <div className="flex h-screen overflow-hidden bg-pixel-bg">
      {!isMobile && <Sidebar role={user?.role} />}
      <main className="flex-1 flex flex-col min-h-0 overflow-y-auto pb-safe md:pb-0">
        <Outlet />
      </main>
      {isMobile && <MobileNav role={user?.role} />}
    </div>
  )
}
