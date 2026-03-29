import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react'
import { clientApi } from '@/lib/api'

function SetRow({ set, index, onChange, showWeight, label }) {
  return (
    <div className={`grid gap-2 items-center ${showWeight ? 'grid-cols-3' : 'grid-cols-2'}`}>
      <span className="text-center text-sm font-medium text-gray-500">{label ?? index + 1}</span>
      {showWeight && (
        <input
          value={set.weight ?? ''}
          onChange={e => onChange(index, 'weight', e.target.value)}
          placeholder="kg"
          className="input text-center text-sm py-2"
          type="text"
          inputMode="decimal"
        />
      )}
      <input
        value={set.reps ?? ''}
        onChange={e => onChange(index, 'reps', e.target.value)}
        placeholder="reps"
        className="input text-center text-sm py-2"
        type="text"
        inputMode="numeric"
      />
    </div>
  )
}

function getYouTubeId(url) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

function WarmCoolCard({ ex }) {
  const [open, setOpen] = useState(true)
  const [demoOpen, setDemoOpen] = useState(false)
  const ytId = getYouTubeId(ex.youtube_url)

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4"
      >
        <p className="font-semibold text-gray-900 text-sm text-left">{ex.name}</p>
        {open
          ? <ChevronUp size={16} className="text-gray-400 shrink-0" />
          : <ChevronDown size={16} className="text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          {ex.notes && (
            <p className="text-xs text-gray-500">{ex.notes}</p>
          )}
          {ytId && (
            <div>
              <button
                onClick={() => setDemoOpen(o => !o)}
                className="flex items-center gap-1.5 text-xs font-medium text-brand-600 py-1"
              >
                {demoOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                Demo available
              </button>
              {demoOpen && (
                <div className="flex justify-center mt-1">
                  <div className="relative rounded-xl overflow-hidden bg-black" style={{ width: '160px', aspectRatio: '9/16' }}>
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&loop=1&playlist=${ytId}&mute=1&controls=0&playsinline=1&modestbranding=1&rel=0`}
                      className="absolute inset-0 w-full h-full"
                      allow="autoplay; encrypted-media"
                      allowFullScreen
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function setLabel(index, bilateral) {
  if (!bilateral) return index + 1
  const setNum = Math.floor(index / 2) + 1
  return `${setNum} ${index % 2 === 0 ? 'Left' : 'Right'}`
}

function ExercisePanel({ ex, sets, notes, onSetChange, onNotesChange, readOnly }) {
  const [open, setOpen] = useState(true)
  const [demoOpen, setDemoOpen] = useState(false)
  const showWeight = !!ex.log_weight
  const ytId = getYouTubeId(ex.youtube_url)

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
            {ex.prescribed_rest_secs ? ` · ${ex.prescribed_rest_secs}s rest` : ''}
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
          {ytId && (
            <div>
              <button
                onClick={() => setDemoOpen(o => !o)}
                className="flex items-center gap-1.5 text-xs font-medium text-brand-600 py-1"
              >
                {demoOpen
                  ? <ChevronUp size={13} />
                  : <ChevronDown size={13} />}
                Demo available
              </button>
              {demoOpen && (
                <div className="flex justify-center mt-1">
                  <div className="relative rounded-xl overflow-hidden bg-black" style={{ width: '160px', aspectRatio: '9/16' }}>
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&loop=1&playlist=${ytId}&mute=1&controls=0&playsinline=1&modestbranding=1&rel=0`}
                      className="absolute inset-0 w-full h-full"
                      allow="autoplay; encrypted-media"
                      allowFullScreen
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          {!readOnly && sets.length > 0 && (
            <>
              <div className={`grid gap-2 text-xs text-gray-400 font-medium text-center mb-1 ${showWeight ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <span>Set</span>
                {showWeight && <span>Weight</span>}
                <span>Reps</span>
              </div>
              {sets.map((set, i) => (
                <SetRow key={i} set={set} index={i} onChange={onSetChange} showWeight={showWeight} label={setLabel(i, ex.log_bilateral)} />
              ))}
            </>
          )}
          {!readOnly && (
            <textarea
              value={notes}
              onChange={e => onNotesChange(e.target.value)}
              placeholder="Notes for this exercise…"
              rows={2}
              className="input w-full text-sm resize-none mt-2"
            />
          )}
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
      if (ex.section === 'WARMUP' || ex.section === 'COOLDOWN') return
      const log = ex.exercise_log
      const slotCount = (ex.prescribed_sets ?? 0) * (ex.log_bilateral ? 2 : 1)
      state[ex.id] = {
        sets: log?.sets?.length
          ? log.sets.map(s => ({ reps: String(s.reps ?? ''), weight: String(s.weight ?? '') }))
          : Array.from({ length: slotCount }, () => ({ reps: '', weight: '' })),
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
      // Build exercise_logs — only MAIN exercises are logged (warmup/cooldown are informational)
      const exercise_logs = (workout.exercises || []).filter(ex => !ex.section || ex.section === 'MAIN').map(ex => {
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
            reps:   s.reps   !== '' ? parseInt(s.reps,   10) : null,
            weight: s.weight !== '' ? parseFloat(s.weight)   : null,
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

  const today = new Date().toISOString().split('T')[0]
  const isFuture = workout?.scheduled_date > today && workout?.status === 'SCHEDULED'
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

      {(() => {
        const warmup   = workout.exercises?.filter(ex => ex.section === 'WARMUP')   || []
        const main     = workout.exercises?.filter(ex => !ex.section || ex.section === 'MAIN') || []
        const cooldown = workout.exercises?.filter(ex => ex.section === 'COOLDOWN') || []
        return (
          <div className="space-y-5 mb-6">
            {warmup.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Warm Up</p>
                <div className="space-y-2">
                  {warmup.map(ex => <WarmCoolCard key={ex.id} ex={ex} />)}
                </div>
              </div>
            )}
            {main.length > 0 && (
              <div>
                {(warmup.length > 0 || cooldown.length > 0) && (
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Exercises</p>
                )}
                <div className="space-y-3">
                  {main.map(ex => (
                    <ExercisePanel
                      key={ex.id}
                      ex={ex}
                      sets={logState[ex.id]?.sets || []}
                      notes={logState[ex.id]?.notes || ''}
                      onSetChange={(setIndex, key, val) => updateSet(ex.id, setIndex, key, val)}
                      onNotesChange={val => updateNotes(ex.id, val)}
                      readOnly={isFuture}
                    />
                  ))}
                </div>
              </div>
            )}
            {cooldown.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Cool Down</p>
                <div className="space-y-2">
                  {cooldown.map(ex => <WarmCoolCard key={ex.id} ex={ex} />)}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {isFuture ? (
        <div className="card p-4 text-center border-blue-100 bg-blue-50">
          <p className="text-sm font-semibold text-blue-700">Scheduled for {new Date(workout.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <p className="text-xs text-blue-500 mt-0.5">You can log this workout on the day.</p>
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  )
}
