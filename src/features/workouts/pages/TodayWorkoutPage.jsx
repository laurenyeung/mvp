import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Calendar, CheckCircle2, ChevronRight, Dumbbell } from 'lucide-react'
import { clientApi } from '@/lib/api'
import { useAuthStore } from '@/features/auth/store/authStore'
import { formatDate } from '@/lib/utils'

function WorkoutCard({ workout, navigate }) {
  if (workout.status === 'COMPLETED') {
    return (
      <div className="card p-5 text-center border-green-200 bg-green-50">
        <CheckCircle2 size={32} className="mx-auto mb-2 text-green-500" />
        <p className="font-bold text-gray-900">{workout.name}</p>
        <p className="text-sm text-green-700 mt-0.5">Completed today 🎉</p>
      </div>
    )
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="font-bold text-gray-900 text-lg leading-tight">{workout.name}</p>
        <span className="bg-brand-50 text-brand-700 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ml-2">
          Scheduled
        </span>
      </div>

      <div className="space-y-2 mb-4">
        {workout.exercises?.slice(0, 4).map((ex, i) => (
          <div key={ex.id} className="flex items-center gap-2 text-sm">
            <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-medium shrink-0">
              {i + 1}
            </span>
            <span className="text-gray-800">{ex.name}</span>
            {(ex.prescribed_sets || ex.prescribed_reps) && (
              <span className="text-gray-400 text-xs ml-auto">
                {ex.prescribed_sets && ex.prescribed_reps
                  ? `${ex.prescribed_sets}×${ex.prescribed_reps}`
                  : ex.prescribed_sets
                  ? `${ex.prescribed_sets} sets`
                  : ex.prescribed_reps}
              </span>
            )}
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
  )
}

function FutureWorkoutRow({ workout, navigate }) {
  return (
    <div
      className="card p-4 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
      onClick={() => navigate(`/client/workouts/${workout.id}/log`)}
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm">{workout.name}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatDate(workout.scheduled_date)}
          {workout.exercises?.length > 0 && ` · ${workout.exercises.length} exercise${workout.exercises.length === 1 ? '' : 's'}`}
        </p>
      </div>
      <ChevronRight size={16} className="text-gray-300 shrink-0" />
    </div>
  )
}

export default function TodayWorkoutPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()

  const { data: todayWorkouts = [], isLoading: loadingToday } = useQuery({
    queryKey: ['today-workout'],
    queryFn: () => clientApi.todayWorkout().then(r => r.data.data),
  })

  const { data: futureWorkouts = [], isLoading: loadingFuture } = useQuery({
    queryKey: ['upcoming-workouts'],
    queryFn: () => clientApi.upcomingWorkouts().then(r => r.data.data),
  })

  const isLoading = loadingToday || loadingFuture

  // For today, prefer SCHEDULED; fall back to COMPLETED
  const todayWorkout = todayWorkouts.find(w => w.status === 'SCHEDULED')
    ?? todayWorkouts.find(w => w.status === 'COMPLETED')
    ?? null

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="page-header">Hey, {user?.first_name} 👋</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-5 animate-pulse h-24 bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Today section */}
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Today</h2>
            {todayWorkout ? (
              <WorkoutCard workout={todayWorkout} navigate={navigate} />
            ) : (
              <div className="card p-6 text-center">
                <Calendar size={32} className="mx-auto mb-2 text-gray-300" />
                <p className="font-semibold text-gray-600 text-sm">No workout today</p>
                <p className="text-xs text-gray-400 mt-1">Enjoy the rest!</p>
              </div>
            )}
          </section>

          {/* Future section */}
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Future</h2>
            {futureWorkouts.length > 0 ? (
              <div className="space-y-2">
                {futureWorkouts.map(w => (
                  <FutureWorkoutRow key={w.id} workout={w} navigate={navigate} />
                ))}
              </div>
            ) : (
              <div className="card p-6 text-center">
                <Calendar size={32} className="mx-auto mb-2 text-gray-300" />
                <p className="font-semibold text-gray-600 text-sm">No upcoming workouts</p>
                <p className="text-xs text-gray-400 mt-1">Your coach will assign more soon.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
