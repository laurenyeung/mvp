import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      // Token is stored only in an httpOnly cookie — never in JS state or localStorage.
      setAuth: (user) => set({ user }),
      logout:  ()     => set({ user: null }),
    }),
    { name: 'auth-storage' }
  )
)
