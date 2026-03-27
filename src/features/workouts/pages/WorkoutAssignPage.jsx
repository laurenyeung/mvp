import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { coachApi } from '@/lib/api'

function ExerciseSlot({ ex, index, onChange, onRemove }) {
  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-900 flex-1">{ex.name}</span>
        <button onClick={() => onRemove(index)} className="text-gray-400 hover:text-red-500 p-1 shrink-0">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { key: 'prescribed_sets', label: 'Sets', placeholder: '3' },
          { key: 'prescribed_reps', label: 'Reps', placeholder: '10' },
          { key: 'prescribed_rest_secs', label: 'Rest (s)', placeholder: '90' },
        ].map(({ key, label, placeholder }) => (
          <div key={key}>
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <input
              value={ex[key] ?? ''}
              onChange={e => onChange(index, key, e.target.value)}
              placeholder={placeholder}
              className="input text-sm py-2"
            />
          </div>
        ))}
      </div>
      <input
        value={ex.notes ?? ''}
        onChange={e => onChange(index, 'notes', e.target.value)}
        placeholder="Coach notes for this exercise (optional)"
        className="input text-sm py-2"
      />
    </div>
  )
}

export default function WorkoutAssignPage() {
  const { id: clientId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [templateId, setTemplateId] = useState('')
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [exercises, setExercises] = useState([])

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => coachApi.listTemplates().then(r => r.data.data),
  })

  const { data: client } = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => coachApi.getClient(clientId).then(r => r.data.data),
  })

  // When a template is selected, seed exercises from its data (already in the list)
  useEffect(() => {
    if (!templateId || !templates) {
      setExercises([])
      return
    }
    const tmpl = templates.find(t => t.id === templateId)
    if (tmpl?.exercises) {
      setExercises(tmpl.exercises.map(ex => ({
        exercise_id: ex.exercise_id,
        name: ex.name,
        prescribed_sets: ex.prescribed_sets ?? '',
        prescribed_reps: ex.prescribed_reps ?? '',
        prescribed_rest_secs: ex.prescribed_rest_secs ?? '',
        prescribed_weight: ex.prescribed_weight ?? '',
        prescribed_tempo: ex.prescribed_tempo ?? '',
        notes: ex.notes ?? '',
      })))
    } else {
      setExercises([])
    }
  }, [templateId, templates])

  const updateExercise = (i, key, val) =>
    setExercises(prev => prev.map((ex, idx) => idx === i ? { ...ex, [key]: val } : ex))

  const removeExercise = (i) =>
    setExercises(prev => prev.filter((_, idx) => idx !== i))

  const { mutate, isPending, error } = useMutation({
    mutationFn: () => {
      const payload = {
        template_id: templateId,
        client_id: clientId,
        scheduled_date: date,
        name: name || undefined,
        exercises: exercises.map((ex, i) => ({
          exercise_id: ex.exercise_id,
          order_index: i,
          prescribed_sets: ex.prescribed_sets !== '' && ex.prescribed_sets != null
            ? Number(ex.prescribed_sets) : null,
          prescribed_reps: ex.prescribed_reps || null,
          prescribed_rest_secs: ex.prescribed_rest_secs !== '' && ex.prescribed_rest_secs != null
            ? Number(ex.prescribed_rest_secs) : null,
          prescribed_weight: ex.prescribed_weight || null,
          prescribed_tempo: ex.prescribed_tempo || null,
          notes: ex.notes || null,
        })),
      }
      return coachApi.assignWorkout(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client-workouts', clientId] })
      navigate(`/coach/clients/${clientId}`)
    },
  })

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <button onClick={() => navigate(-1)} className="btn-ghost gap-2 mb-4 -ml-2">
        <ArrowLeft size={16} /> Back
      </button>

      <h1 className="page-header mb-1">Assign Workout</h1>
      {client && <p className="text-sm text-gray-500 mb-6">To {client.first_name} {client.last_name}</p>}

      <div className="space-y-4">
        <div className="card p-5 space-y-4">
          <div>
            <label className="label">Template *</label>
            <select value={templateId} onChange={e => { setTemplateId(e.target.value); setName('') }} className="input">
              <option value="">Select a template…</option>
              {templates?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Scheduled Date *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input" />
          </div>

          <div>
            <label className="label">Custom Name (optional)</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input" placeholder="Override template name…" />
          </div>
        </div>

        {exercises.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Exercises — customize before assigning
            </h2>
            <div className="space-y-2">
              {exercises.map((ex, i) => (
                <ExerciseSlot key={i} ex={ex} index={i} onChange={updateExercise} onRemove={removeExercise} />
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="text-red-500 text-sm">{error.response?.data?.error?.message || 'Failed to assign workout'}</p>
        )}

        <button
          onClick={() => mutate()}
          disabled={isPending || !templateId || !date}
          className="btn-primary w-full"
        >
          {isPending ? 'Assigning…' : 'Assign Workout'}
        </button>
      </div>
    </div>
  )
}
