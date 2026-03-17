import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus, GripVertical, Trash2, Search } from 'lucide-react'
import { coachApi, exercisesApi } from '@/lib/api'

function ExerciseSlot({ ex, index, onRemove, onChange }) {
  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <GripVertical size={16} className="text-gray-300 shrink-0" />
        <span className="text-sm font-medium text-gray-900 flex-1">{ex.name}</span>
        <button onClick={() => onRemove(index)} className="text-gray-400 hover:text-red-500 p-1">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 pl-6">
        {[
          { key: 'prescribed_sets', label: 'Sets', placeholder: '3' },
          { key: 'prescribed_reps', label: 'Reps', placeholder: '10' },
          { key: 'prescribed_rest_secs', label: 'Rest (s)', placeholder: '90' },
        ].map(({ key, label, placeholder }) => (
          <div key={key}>
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            <input
              value={ex[key] || ''}
              onChange={e => onChange(index, key, e.target.value)}
              placeholder={placeholder}
              className="input text-sm py-2"
            />
          </div>
        ))}
      </div>
      <div className="pl-6">
        <input
          value={ex.notes || ''}
          onChange={e => onChange(index, 'notes', e.target.value)}
          placeholder="Notes (optional)"
          className="input text-sm py-2"
        />
      </div>
    </div>
  )
}

export default function TemplateBuilderModal({ template, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!template

  const [name, setName] = useState(template?.name || '')
  const [description, setDescription] = useState(template?.description || '')
  const [duration, setDuration] = useState(template?.estimated_duration_minutes || '')
  const [exercises, setExercises] = useState(template?.exercises || [])
  const [exSearch, setExSearch] = useState('')
  const [showPicker, setShowPicker] = useState(false)

  const { data: exerciseResults } = useQuery({
    queryKey: ['exercises', exSearch],
    queryFn: () => exercisesApi.list({ search: exSearch, limit: 20 }).then(r => r.data.data),
    enabled: showPicker,
  })

  const { mutate, isPending } = useMutation({
    mutationFn: (body) =>
      isEdit
        ? coachApi.updateTemplate(template.id, body)
        : coachApi.createTemplate(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] })
      onClose()
    },
  })

  const addExercise = (ex) => {
    setExercises(prev => [...prev, { ...ex, prescribed_sets: '3', prescribed_reps: '10' }])
    setShowPicker(false)
    setExSearch('')
  }

  const removeExercise = (i) => setExercises(prev => prev.filter((_, idx) => idx !== i))

  const updateExercise = (i, key, val) =>
    setExercises(prev => prev.map((ex, idx) => idx === i ? { ...ex, [key]: val } : ex))

  const handleSave = () => {
    if (!name.trim()) return
    mutate({
      name,
      description,
      estimated_duration_minutes: duration ? Number(duration) : undefined,
      exercises: exercises.map((ex, i) => ({
        exercise_id: ex.id,
        order_index: i,
        prescribed_sets: Number(ex.prescribed_sets) || 3,
        prescribed_reps: ex.prescribed_reps || '10',
        prescribed_rest_secs: ex.prescribed_rest_secs ? Number(ex.prescribed_rest_secs) : null,
        notes: ex.notes || null,
      })),
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center">
      <div className="bg-white w-full max-w-lg rounded-t-2xl md:rounded-2xl shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-semibold text-gray-900">{isEdit ? 'Edit Template' : 'New Template'}</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="label">Template Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input" placeholder="e.g. Upper Body A" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Duration (min)</label>
              <input value={duration} onChange={e => setDuration(e.target.value)} type="number" className="input" placeholder="45" />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="input resize-none min-h-[60px]" placeholder="Optional…" />
          </div>

          {/* Exercises */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Exercises ({exercises.length})</label>
              <button onClick={() => setShowPicker(true)} className="btn-ghost text-brand-600 gap-1 text-sm py-1">
                <Plus size={15} /> Add
              </button>
            </div>
            <div className="space-y-2">
              {exercises.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No exercises yet — add some above</p>
              )}
              {exercises.map((ex, i) => (
                <ExerciseSlot key={`${ex.id}-${i}`} ex={ex} index={i} onRemove={removeExercise} onChange={updateExercise} />
              ))}
            </div>
          </div>

          {/* Exercise picker */}
          {showPicker && (
            <div className="card border-brand-200 p-3">
              <div className="relative mb-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={exSearch}
                  onChange={e => setExSearch(e.target.value)}
                  placeholder="Search exercises…"
                  className="input pl-9 text-sm py-2"
                  autoFocus
                />
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {exerciseResults?.map(ex => (
                  <button
                    key={ex.id}
                    onClick={() => addExercise(ex)}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-brand-50 flex items-center justify-between"
                  >
                    <span className="font-medium">{ex.name}</span>
                    <span className="text-xs text-gray-400">{ex.primary_muscle_group}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setShowPicker(false)} className="btn-ghost text-sm w-full mt-2">Cancel</button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 shrink-0 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={isPending || !name.trim()} className="btn-primary flex-1">
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  )
}
