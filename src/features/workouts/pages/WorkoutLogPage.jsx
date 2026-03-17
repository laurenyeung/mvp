import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useState, useRef, useCallback } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, Timer, ArrowLeft } from 'lucide-react'
import { clientApi } from '@/lib/api'
import { cn } from '@/lib/utils'

function SetRow({ set, index, onChange }) {
  return (
    <div className="grid grid-cols-4 gap-2 items-center">
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
      <button
        onClick={() => onChange(index, 'completed', !set.completed)}
        className={cn(
          'h-9 w-9 rounded-full flex items-center justify-center mx-auto transition-colors',
          set.completed ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'
        )}
      >
        <CheckCircle2 size={18} />
      </button>
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
            {ex.prescribed_sets} sets × {ex.prescribed_reps}
            {ex.prescribed_weight ? ` @ ${ex.prescribed_weight}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-green-600 font-medium">
            {logs.filter(s => s.completed).length}/{logs.length} done
          </span>
          {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          <div className="grid grid-cols-4 gap-2 text-xs text-gray-400 font-medium text-center mb-1">
            <span>Set</span><span>Weight</span><span>Reps</span><span>✓</span>
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
  const syncTimer = useRef(null)

  const { data: workout, isLoading } = useQuery({
    queryKey: ['workout', id],
    queryFn: () => clientApi.listWorkouts().then(r =>
      r.data.data.find(w => w.id === id)
    ),
  })

  // Initialize set state from prescribed sets
  const initLogs = useCallback((exercises) => {
    const state = {}
    exercises?.forEach(ex => {
      state[ex.id] = Array.from({ length: ex.prescribed_sets || 3 }, () => ({
        reps: '', weight: '', completed: false,
      }))
    })
    return state
  }, [])

  const [logState, setLogState] = useState({})
  const [initialized, setInitialized] = useState(false)
  const [rating, setRating] = useState(0)
  const [notes, setNotes] = useState('')
  const [done, setDone] = useState(false)

  if (workout && !initialized) {
    setLogState(initLogs(workout.exercises))
    setInitialized(true)
  }

  const { mutate: submitLog, isPending } = useMutation({
    mutationFn: () => clientApi.logWorkout(id, {
      rating,
      overall_notes: notes,
      exercise_logs: workout.exercises.map(ex => ({
        workout_exercise_id: ex.id,
        actual_sets: logState[ex.id]?.filter(s => s.completed).length,
        actual_reps: logState[ex.id]?.filter(s => s.completed).map(s => s.reps).join(','),
        actual_weight: logState[ex.id]?.filter(s => s.completed).map(s => s.weight).join(','),
      })),
    }),
    onSuccess: () => setDone(true),
  })

  const updateSet = (exId, setIndex, key, val) => {
    setLogState(prev => ({
      ...prev,
      [exId]: prev[exId].map((s, i) => i === setIndex ? { ...s, [key]: val } : s),
    }))
  }

  if (isLoading) return <div className="p-6 text-center text-gray-400">Loading workout…</div>

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
      {/* Back */}
      <button onClick={() => navigate(-1)} className="btn-ghost gap-2 mb-4 -ml-2">
        <ArrowLeft size={16} /> Back
      </button>

      <h1 className="page-header mb-1">{workout?.name}</h1>
      <p className="text-sm text-gray-400 mb-5">{workout?.exercises?.length} exercises</p>

      <div className="space-y-3 mb-6">
        {workout?.exercises?.map(ex => (
          <ExercisePanel
            key={ex.id}
            ex={ex}
            logs={logState[ex.id] || []}
            onChange={(setIndex, key, val) => updateSet(ex.id, setIndex, key, val)}
          />
        ))}
      </div>

      {/* Rating */}
      <div className="card p-4 mb-4">
        <p className="text-sm font-medium text-gray-700 mb-2">Rate this session</p>
        <div className="flex gap-2">
          {[1,2,3,4,5].map(n => (
            <button
              key={n}
              onClick={() => setRating(n)}
              className={cn(
                'flex-1 py-2 rounded-xl text-sm font-semibold border transition-colors',
                rating === n
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'border-gray-200 text-gray-400 hover:border-gray-300'
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any notes about this session…"
          className="input mt-3 resize-none min-h-[60px] text-sm"
        />
      </div>

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
