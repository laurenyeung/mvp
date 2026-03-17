import { useQuery } from '@tanstack/react-query'
import { Calendar, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { clientApi } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

const STATUS_STYLES = {
  COMPLETED: { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50', label: 'Completed' },
  MISSED:    { icon: XCircle,      color: 'text-red-400',   bg: 'bg-red-50',   label: 'Missed' },
  SCHEDULED: { icon: Clock,        color: 'text-blue-500',  bg: 'bg-blue-50',  label: 'Scheduled' },
}

export default function WorkoutHistoryPage() {
  const { data: workouts, isLoading } = useQuery({
    queryKey: ['workouts-history'],
    queryFn: () => clientApi.listWorkouts().then(r => r.data.data),
  })

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <h1 className="page-header mb-6">Workout History</h1>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse h-20 bg-gray-100" />
          ))}
        </div>
      ) : workouts?.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Calendar size={40} className="mx-auto mb-3 opacity-30" />
          <p>No workouts yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {workouts?.map(w => {
            const { icon: Icon, color, bg, label } = STATUS_STYLES[w.status] || STATUS_STYLES.SCHEDULED
            return (
              <div key={w.id} className="card p-4 flex items-center gap-3">
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', bg)}>
                  <Icon size={20} className={color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{w.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(w.scheduled_date)}</p>
                </div>
                <span className={cn('text-xs font-medium', color)}>{label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
