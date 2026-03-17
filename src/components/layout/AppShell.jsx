import { Outlet } from 'react-router-dom'
import { useAuthStore } from '@/features/auth/store/authStore'
import MobileNav from './MobileNav.jsx'
import Sidebar from './Sidebar.jsx'
import { useMediaQuery } from '@/lib/useMediaQuery'

export default function AppShell() {
  const { user } = useAuthStore()
  const isMobile = useMediaQuery('(max-width: 768px)')

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {!isMobile && <Sidebar role={user?.role} />}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <Outlet />
      </main>
      {isMobile && <MobileNav role={user?.role} />}
    </div>
  )
}
