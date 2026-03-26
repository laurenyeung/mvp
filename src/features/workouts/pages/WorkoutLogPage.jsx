import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react'
import { clientApi } from '@/lib/api'

function SetRow({ set, index, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-2 items-center">
      <span className="text-center text-sm font-medium text-gray-500">{index + 1}</span>
      <input
        value={set.weight || ''}
        onChange={e => onChange(index, 'weight', e.target.value)}
        placeholder="kg"
        className="input text-center text-sm py-2"
        type="number"
        inputMode="decimal"
      />
      <input
        value={set.reps || ''}
        onChange={e => onChange(index, 'reps', e.target.value)}
        placeholder="reps"
        className="input text-center text-sm py-2"
        type="number"
        inputMode="numeric"
      />
    </div>
  )
}

function ExercisePanel({ ex, logs, onChange }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4"
      >
        <div className="text-left">
          <p className="font-semibold text-gray-900 text-sm">{ex.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {ex.prescribed_sets ? `${ex.prescribed_sets} sets` : ''}
            {ex.prescribed_sets && ex.prescribed_reps ? ' × ' : ''}
            {ex.prescribed_reps || ''}
            {ex.prescribed_weight ? ` @ ${ex.prescribed_weight}` : ''}
          </p>
        </div>
        {open
          ? <ChevronUp size={16} className="text-gray-400" />
          : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          <div className="grid grid-cols-3 gap-2 text-xs text-gray-400 font-medium text-center mb-1">
            <span>Set</span><span>Weight</span><span>Reps</span>
          </div>
          {logs.map((set, i) => (
            <SetRow key={i} set={set} index={i} onChange={onChange} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function WorkoutLogPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  // Fetch the specific workout directly — don't scan the full list
  const { data: workout, isLoading } = useQuery({
    queryKey: ['workout', id],
    queryFn: async () => {
      const res = await clientApi.listWorkouts()
      return res.data.data.find(w => w.id === id) ?? null
    },
  })

  const initLogs = useCallback((exercises) => {
    const state = {}
    exercises?.forEach(ex => {
      // Default to prescribed_sets rows; fall back to 3 if null/undefined
      const rows = ex.prescribed_sets ?? 3
      state[ex.id] = Array.from({ length: rows }, () => ({ reps: '', weight: '' }))
    })
    return state
  }, [])

  const [logState, setLogState] = useState({})
  const [initialized, setInitialized] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [done, setDone] = useState(false)

  if (workout && !initialized) {
    setLogState(initLogs(workout.exercises))
    setInitialized(true)
  }

  const { mutate: submitLog, isPending } = useMutation({
    mutationFn: () => {
      // Build exercise_logs — workout_exercise_id is ex.id (the workout_exercises row id)
      const exercise_logs = (workout.exercises || []).map(ex => {
        const sets = logState[ex.id] || []
        return {
          workout_exercise_id: ex.id,
          actual_sets:   sets.filter(s => s.reps || s.weight).length || null,
          actual_reps:   sets.map(s => s.reps).filter(Boolean).join(',') || null,
          actual_weight: sets.map(s => s.weight).filter(Boolean).join(',') || null,
        }
      })
      return clientApi.logWorkout(id, { exercise_logs })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', id] })
      qc.invalidateQueries({ queryKey: ['workouts-history'] })
      qc.invalidateQueries({ queryKey: ['today-workout'] })
      setDone(true)
    },
    onError: (err) => {
      const msg = err.response?.data?.error?.message
      setSubmitError(msg || 'Failed to save workout. Please try again.')
    },
  })

  const updateSet = (exId, setIndex, key, val) => {
    setSubmitError('')
    setLogState(prev => ({
      ...prev,
      [exId]: prev[exId].map((s, i) => i === setIndex ? { ...s, [key]: val } : s),
    }))
  }

  if (isLoading) return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="card p-4 animate-pulse h-24 bg-gray-100" />
      ))}
    </div>
  )

  if (!workout) return (
    <div className="p-6 text-center text-gray-400">Workout not found.</div>
  )

  if (done) return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <CheckCircle2 size={64} className="mx-auto mb-4 text-green-500" />
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Workout Complete!</h2>
      <p className="text-gray-500 mb-6">Great work. Your session has been logged.</p>
      <button onClick={() => navigate('/client/today')} className="btn-primary px-8">
        Back to Home
      </button>
    </div>
  )

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <button onClick={() => navigate(-1)} className="btn-ghost gap-2 mb-4 -ml-2">
        <ArrowLeft size={16} /> Back
      </button>

      <h1 className="page-header mb-1">{workout.name}</h1>
      <p className="text-sm text-gray-400 mb-5">
        {workout.exercises?.length ?? 0} exercises
      </p>

      <div className="space-y-3 mb-6">
        {workout.exercises?.map(ex => (
          <ExercisePanel
            key={ex.id}
            ex={ex}
            logs={logState[ex.id] || []}
            onChange={(setIndex, key, val) => updateSet(ex.id, setIndex, key, val)}
          />
        ))}
      </div>

      {submitError && (
        <p className="text-red-500 text-sm mb-3 text-center">{submitError}</p>
      )}

      <button
        onClick={() => submitLog()}
        disabled={isPending}
        className="btn-primary w-full py-3.5 text-base"
      >
        {isPending ? 'Saving…' : 'Complete Workout'}
      </button>
    </div>
  )
}
