import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, Pencil } from 'lucide-react'
import { coachApi } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

const STATUS = {
  COMPLETED:  { icon: CheckCircle2, color: 'text-green-500', label: 'Completed' },
  SCHEDULED:  { icon: Clock,        color: 'text-blue-500',  label: 'Scheduled' },
  INCOMPLETE: { icon: XCircle,      color: 'text-red-500',   label: 'Incomplete' },
}

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function resolveStatus(status, scheduled_date) {
  if (status === 'SCHEDULED' && scheduled_date) {
    if (scheduled_date < localToday()) return 'INCOMPLETE'
  }
  return status
}

function getYouTubeId(url) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

function ExerciseCard({ ex }) {
  const [demoOpen, setDemoOpen] = useState(false)
  const ytId = getYouTubeId(ex.youtube_url)
  const hasLog = !!ex.exercise_log

  const prescribedParts = [
    ex.prescribed_sets && ex.prescribed_reps
      ? `${ex.prescribed_sets} × ${ex.prescribed_reps}`
      : ex.prescribed_sets
        ? `${ex.prescribed_sets} sets`
        : ex.prescribed_reps
          ? `${ex.prescribed_reps} reps`
          : null,
    ex.prescribed_weight ? `@ ${ex.prescribed_weight}` : null,
    ex.prescribed_rest_secs ? `${ex.prescribed_rest_secs}s rest` : null,
  ].filter(Boolean)

  return (
    <div className="card p-4 space-y-3">
      <div>
        <p className="font-semibold text-gray-900 text-sm">{ex.name}</p>
        {prescribedParts.length > 0 && (
          <p className="text-xs text-gray-400 mt-0.5">{prescribedParts.join(' · ')}</p>
        )}
      </div>

      {ex.notes && (
        <p className="text-xs bg-gray-50 rounded-lg px-3 py-2 text-gray-600">
          <span className="font-medium text-gray-400">Coach's Notes: </span>{ex.notes}
        </p>
      )}

      {ytId && (
        <>
          <button
            onClick={() => setDemoOpen(o => !o)}
            className="w-full flex items-center justify-between bg-orange-50 rounded-lg px-3 py-2"
          >
            <p className="text-xs font-medium text-orange-600">Example Video</p>
            {demoOpen ? <ChevronUp size={13} className="text-orange-400" /> : <ChevronDown size={13} className="text-orange-400" />}
          </button>
          {demoOpen && (
            <div className="flex justify-center mt-2">
              <div className="relative rounded-xl overflow-hidden bg-black" style={{ width: '140px', aspectRatio: '9/16' }}>
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&loop=1&playlist=${ytId}&mute=1&controls=0&playsinline=1&modestbranding=1&rel=0`}
                  className="absolute inset-0 w-full h-full"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                />
              </div>
            </div>
          )}
        </>
      )}

      {hasLog && (
        <div className="border-t border-gray-100 pt-3 space-y-1">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Client logged</p>
          {ex.exercise_log.sets?.length > 0 ? (
            <div className="space-y-1">
              {ex.exercise_log.sets.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="text-gray-400 w-10 shrink-0">Set {s.set_index + 1}</span>
                  <span>{s.reps} reps{s.weight ? ` · ${s.weight} lb` : ''}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400">No sets logged</p>
          )}
          {ex.exercise_log.notes && (
            <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded px-3 py-2">
              <span className="font-medium text-gray-400 uppercase tracking-wide text-[10px]">Client note · </span>
              {ex.exercise_log.notes}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ label, exercises }) {
  const items = exercises.filter(ex => ex.section === label.key)
  if (!items.length) return null
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label.display}</p>
      {items.map(ex => <ExerciseCard key={ex.id} ex={ex} />)}
    </div>
  )
}

const SECTIONS = [
  { key: 'WARMUP',   display: 'Warm Up' },
  { key: 'MAIN',     display: 'Exercises' },
  { key: 'COOLDOWN', display: 'Cool Down' },
]

export default function CoachWorkoutDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [isEditingDate, setIsEditingDate] = useState(false)
  const [dateInput, setDateInput] = useState('')

  const { data: workout, isLoading } = useQuery({
    queryKey: ['coach-workout', id],
    queryFn: () => coachApi.getWorkout(id).then(r => r.data.data),
  })

  const { data: client } = useQuery({
    queryKey: ['client', workout?.client_id],
    queryFn: () => coachApi.getClient(workout.client_id).then(r => r.data.data),
    enabled: !!workout?.client_id,
  })

  const { mutate: saveDate, isPending: isSavingDate } = useMutation({
    mutationFn: () => coachApi.updateWorkout(id, { scheduled_date: dateInput }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coach-workout', id] })
      qc.invalidateQueries({ queryKey: ['client-workouts', workout.client_id] })
      setIsEditingDate(false)
    },
  })

  if (isLoading) return <div className="p-6 text-center text-gray-400">Loading…</div>
  if (!workout)  return <div className="p-6 text-center text-gray-400">Workout not found</div>

  const resolved = resolveStatus(workout.status, workout.scheduled_date)
  const { icon: StatusIcon, color: statusColor, label: statusLabel } = STATUS[resolved] || STATUS.SCHEDULED
  const canEdit = workout.status === 'SCHEDULED'

  function startEditDate() {
    // Format the existing date as YYYY-MM-DD for the input
    const d = workout.scheduled_date ? workout.scheduled_date.slice(0, 10) : ''
    setDateInput(d)
    setIsEditingDate(true)
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <button onClick={() => navigate(-1)} className="btn-ghost gap-2 mb-4 -ml-2">
        <ArrowLeft size={16} /> Back
      </button>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <h1 className="page-header leading-tight">{workout.name}</h1>
          <span className={cn('flex items-center gap-1 text-xs font-medium shrink-0 mt-1', statusColor)}>
            <StatusIcon size={14} />
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-sm text-gray-400">
          {client && <span>{client.first_name} {client.last_name} · </span>}
          {isEditingDate ? (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateInput}
                onChange={e => setDateInput(e.target.value)}
                className="input text-sm py-1 px-2 h-7 w-auto"
              />
              <button
                onClick={() => saveDate()}
                disabled={isSavingDate || !dateInput}
                className="btn-primary py-1 px-2.5 text-xs"
              >
                {isSavingDate ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setIsEditingDate(false)}
                className="btn-ghost py-1 px-2 text-xs"
              >
                Cancel
              </button>
            </div>
          ) : (
            <span className="flex items-center gap-1.5">
              {formatDate(workout.scheduled_date)}
              {canEdit && (
                <button
                  onClick={startEditDate}
                  className="text-gray-300 hover:text-pixel-accent transition-colors"
                  aria-label="Edit date"
                >
                  <Pencil size={12} />
                </button>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Exercise sections */}
      <div className="space-y-6">
        {workout.exercises?.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No exercises in this workout.</p>
        ) : (
          SECTIONS.map(section => (
            <Section key={section.key} label={section} exercises={workout.exercises ?? []} />
          ))
        )}
      </div>
    </div>
  )
}
