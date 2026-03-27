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

function ExercisePanel({ ex, sets, notes, onSetChange, onNotesChange }) {
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
          {ex.notes && (
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <p className="text-xs font-medium text-gray-400 mb-0.5">Coach's Notes</p>
              <p className="text-xs text-gray-600">{ex.notes}</p>
            </div>
          )}
          {sets.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-2 text-xs text-gray-400 font-medium text-center mb-1">
                <span>Set</span><span>Weight</span><span>Reps</span>
              </div>
              {sets.map((set, i) => (
                <SetRow key={i} set={set} index={i} onChange={onSetChange} />
              ))}
            </>
          )}
          <textarea
            value={notes}
            onChange={e => onNotesChange(e.target.value)}
            placeholder="Notes for this exercise…"
            rows={2}
            className="input w-full text-sm resize-none mt-2"
          />
        </div>
      )}
    </div>
  )
}

export default function WorkoutLogPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: workout, isLoading } = useQuery({
    queryKey: ['workout', id],
    queryFn: () => clientApi.getWorkout(id).then(r => r.data.data),
  })

  const initLogs = useCallback((exercises) => {
    const state = {}
    exercises?.forEach(ex => {
      const log = ex.exercise_log
      state[ex.id] = {
        sets: log?.sets?.length
          ? log.sets.map(s => ({ reps: String(s.reps ?? ''), weight: String(s.weight ?? '') }))
          : Array.from({ length: ex.prescribed_sets ?? 0 }, () => ({ reps: '', weight: '' })),
        notes: log?.notes ?? '',
      }
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
        const { sets = [], notes = '' } = logState[ex.id] || {}
        const filledSets = sets.filter(s => s.reps || s.weight)
        return {
          workout_exercise_id: ex.id,
          actual_sets:   filledSets.length || null,
          actual_reps:   filledSets.map(s => s.reps).filter(Boolean).join(',') || null,
          actual_weight: filledSets.map(s => s.weight).filter(Boolean).join(',') || null,
          notes:         notes.trim() || null,
          sets:          filledSets.map((s, i) => ({
            set_index: i,
            reps:   Number(s.reps)   || null,
            weight: Number(s.weight) || null,
          })),
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
      [exId]: { ...prev[exId], sets: prev[exId].sets.map((s, i) => i === setIndex ? { ...s, [key]: val } : s) },
    }))
  }

  const updateNotes = (exId, val) => {
    setLogState(prev => ({
      ...prev,
      [exId]: { ...prev[exId], notes: val },
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

  const isEdit = workout?.status === 'COMPLETED'

  if (done) return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <CheckCircle2 size={64} className="mx-auto mb-4 text-green-500" />
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        {isEdit ? 'Workout Updated!' : 'Workout Complete!'}
      </h2>
      <p className="text-gray-500 mb-6">
        {isEdit ? 'Your changes have been saved.' : 'Great work. Your session has been logged.'}
      </p>
      <button onClick={() => navigate('/client/history')} className="btn-primary px-8">
        Back to History
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
            sets={logState[ex.id]?.sets || []}
            notes={logState[ex.id]?.notes || ''}
            onSetChange={(setIndex, key, val) => updateSet(ex.id, setIndex, key, val)}
            onNotesChange={val => updateNotes(ex.id, val)}
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
        {isPending ? 'Saving…' : isEdit ? 'Update Workout' : 'Complete Workout'}
      </button>
    </div>
  )
}
