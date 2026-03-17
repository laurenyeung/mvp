import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Calendar, CheckCircle2, XCircle, Clock, Trash2 } from 'lucide-react'
import { coachApi } from '@/lib/api'
import { formatDate, getInitials } from '@/lib/utils'
import { cn } from '@/lib/utils'

const STATUS = {
  COMPLETED: { icon: CheckCircle2, color: 'text-green-500', label: 'Done' },
  MISSED:    { icon: XCircle,      color: 'text-red-400',   label: 'Missed' },
  SCHEDULED: { icon: Clock,        color: 'text-blue-500',  label: 'Scheduled' },
}

export default function ClientDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: client, isLoading: loadingClient } = useQuery({
    queryKey: ['client', id],
    queryFn: () => coachApi.getClient(id).then(r => r.data.data),
  })

  const { data: workouts, isLoading: loadingWorkouts } = useQuery({
    queryKey: ['client-workouts', id],
    queryFn: () => coachApi.getClientWorkouts(id).then(r => r.data.data),
  })

  const { mutate: deleteWorkout } = useMutation({
    mutationFn: (wid) => coachApi.deleteWorkout(wid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client-workouts', id] }),
  })

  if (loadingClient) return <div className="p-6 text-center text-gray-400">Loading…</div>

  const completedCount = workouts?.filter(w => w.status === 'COMPLETED').length ?? 0
  const totalCount = workouts?.length ?? 0

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => navigate(-1)} className="btn-ghost gap-2 mb-4 -ml-2">
        <ArrowLeft size={16} /> Clients
      </button>

      {/* Client header */}
      <div className="card p-5 mb-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-bold text-lg shrink-0">
          {getInitials(client?.first_name, client?.last_name)}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900">
            {client?.first_name} {client?.last_name}
          </h1>
          <p className="text-sm text-gray-400 truncate">{client?.email}</p>
          {client?.goals && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">🎯 {client.goals}</p>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Total', value: totalCount },
          { label: 'Completed', value: completedCount },
          { label: 'Rate', value: totalCount ? `${Math.round((completedCount / totalCount) * 100)}%` : '—' },
        ].map(({ label, value }) => (
          <div key={label} className="card p-3 text-center">
            <p className="text-xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Workouts header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-title">Assigned Workouts</h2>
        <button
          onClick={() => navigate(`/coach/clients/${id}/assign`)}
          className="btn-primary gap-1.5 text-sm py-2"
        >
          <Plus size={14} /> Assign
        </button>
      </div>

      {loadingWorkouts ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse h-16 bg-gray-100" />
          ))}
        </div>
      ) : workouts?.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Calendar size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No workouts assigned yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {workouts?.map(w => {
            const { icon: Icon, color, label } = STATUS[w.status] || STATUS.SCHEDULED
            return (
              <div key={w.id} className="card p-3.5 flex items-center gap-3">
                <Icon size={18} className={cn(color, 'shrink-0')} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{w.name}</p>
                  <p className="text-xs text-gray-400">{formatDate(w.scheduled_date)}</p>
                </div>
                <span className={cn('text-xs font-medium shrink-0', color)}>{label}</span>
                {w.status === 'SCHEDULED' && (
                  <button
                    onClick={() => deleteWorkout(w.id)}
                    className="text-gray-300 hover:text-red-400 p-1 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
