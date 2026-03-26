import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Calendar, CheckCircle2, ChevronRight, Dumbbell } from 'lucide-react'
import { clientApi } from '@/lib/api'
import { useAuthStore } from '@/features/auth/store/authStore'

export default function TodayWorkoutPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const { data: workout, isLoading } = useQuery({
    queryKey: ['today-workout'],
    // API returns an array; show the first SCHEDULED workout, or the first COMPLETED one
    queryFn: () => clientApi.todayWorkout().then(r => {
      const workouts = r.data.data
      return workouts.find(w => w.status === 'SCHEDULED')
          ?? workouts.find(w => w.status === 'COMPLETED')
          ?? null
    }),
  })

  if (isLoading) return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="card p-5 animate-pulse h-24 bg-gray-100" />
      ))}
    </div>
  )

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="page-header">Hey, {user?.first_name} 👋</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {!workout ? (
        <div className="card p-8 text-center">
          <Calendar size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="font-semibold text-gray-700">No workout today</p>
          <p className="text-sm text-gray-400 mt-1">Your coach hasn't assigned anything for today. Enjoy the rest!</p>
        </div>
      ) : workout.status === 'COMPLETED' ? (
        <div className="card p-6 text-center border-green-200 bg-green-50">
          <CheckCircle2 size={40} className="mx-auto mb-3 text-green-500" />
          <p className="font-bold text-gray-900 text-lg">{workout.name}</p>
          <p className="text-sm text-green-700 mt-1">Completed today 🎉</p>
        </div>
      ) : (
        <>
          {/* Workout card */}
          <div className="card p-5 mb-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-bold text-gray-900 text-lg leading-tight">{workout.name}</p>
              </div>
              <span className="bg-brand-50 text-brand-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                Scheduled
              </span>
            </div>

            {/* Exercise preview */}
            <div className="space-y-2 mb-4">
              {workout.exercises?.slice(0, 4).map((ex, i) => (
                <div key={ex.id} className="flex items-center gap-2 text-sm">
                  <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-medium shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-gray-800">{ex.name}</span>
                  <span className="text-gray-400 text-xs ml-auto">
                    {ex.prescribed_sets}×{ex.prescribed_reps}
                  </span>
                </div>
              ))}
              {workout.exercises?.length > 4 && (
                <p className="text-xs text-gray-400 pl-7">+{workout.exercises.length - 4} more exercises</p>
              )}
            </div>

            <button
              onClick={() => navigate(`/client/workouts/${workout.id}/log`)}
              className="btn-primary w-full gap-2"
            >
              <Dumbbell size={16} />
              Start Workout
              <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
