import { createBrowserRouter, Navigate } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell.jsx'
import RequireAuth from '@/components/layout/RequireAuth.jsx'
import LoginPage from '@/features/auth/pages/LoginPage.jsx'
import RegisterPage from '@/features/auth/pages/RegisterPage.jsx'

// Coach pages
import ClientRosterPage from '@/features/clients/pages/ClientRosterPage.jsx'
import ClientDetailPage from '@/features/clients/pages/ClientDetailPage.jsx'
import WorkoutBuilderPage from '@/features/workouts/pages/WorkoutBuilderPage.jsx'
import WorkoutAssignPage from '@/features/workouts/pages/WorkoutAssignPage.jsx'

// Client pages
import TodayWorkoutPage from '@/features/workouts/pages/TodayWorkoutPage.jsx'
import WorkoutLogPage from '@/features/workouts/pages/WorkoutLogPage.jsx'
import WorkoutHistoryPage from '@/features/workouts/pages/WorkoutHistoryPage.jsx'
import ProgressPage from '@/features/progress/pages/ProgressPage.jsx'

// Shared pages
import ExerciseLibraryPage from '@/features/exercises/pages/ExerciseLibraryPage.jsx'
import MessagingPage from '@/features/messaging/pages/MessagingPage.jsx'

import RoleRedirect from '@/components/layout/RoleRedirect.jsx'

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <RoleRedirect /> },

      // Coach routes
      { path: 'coach/clients', element: <ClientRosterPage /> },
      { path: 'coach/clients/:id', element: <ClientDetailPage /> },
      { path: 'coach/clients/:id/assign', element: <WorkoutAssignPage /> },
      { path: 'coach/templates', element: <WorkoutBuilderPage /> },

      // Client routes
      { path: 'client/today', element: <TodayWorkoutPage /> },
      { path: 'client/workouts/:id/log', element: <WorkoutLogPage /> },
      { path: 'client/history', element: <WorkoutHistoryPage /> },
      { path: 'client/progress', element: <ProgressPage /> },

      // Shared routes
      { path: 'exercises', element: <ExerciseLibraryPage /> },
      { path: 'messages', element: <MessagingPage /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])
