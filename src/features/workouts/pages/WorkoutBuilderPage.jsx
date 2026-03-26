import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Plus, Trash2, LayoutTemplate, ChevronRight, Clock } from 'lucide-react'
import { coachApi } from '@/lib/api'
import TemplateBuilderModal from '../components/TemplateBuilderModal.jsx'

export default function WorkoutBuilderPage() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editTemplate, setEditTemplate] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => coachApi.listTemplates().then(r => r.data.data),
  })

  const { mutate: deleteTemplate } = useMutation({
    mutationFn: (id) => coachApi.deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  })

  const confirmDelete = (id) => {
    deleteTemplate(id)
    setConfirmDeleteId(null)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-header">Workout Templates</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary gap-2">
          <Plus size={16} /> New
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse h-20 bg-gray-100" />
          ))}
        </div>
      ) : templates?.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <LayoutTemplate size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No templates yet</p>
          <p className="text-sm mt-1">Create your first workout template</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates?.map(t => (
            <div key={t.id} className="card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                <LayoutTemplate size={18} className="text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{t.name}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  {t.estimated_duration_minutes && (
                    <span className="flex items-center gap-1 text-xs text-gray-400">
                      <Clock size={11} /> {t.estimated_duration_minutes} min
                    </span>
                  )}
                  {t.exercises?.length > 0 && (
                    <span className="text-xs text-gray-400">{t.exercises.length} exercises</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEditTemplate(t)}
                  className="btn-ghost p-2 text-gray-400 hover:text-brand-600"
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  onClick={() => setConfirmDeleteId(t.id)}
                  className="btn-ghost p-2 text-gray-400 hover:text-red-500"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(showCreate || editTemplate) && (
        <TemplateBuilderModal
          template={editTemplate}
          onClose={() => { setShowCreate(false); setEditTemplate(null) }}
        />
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-card border border-pixel-border p-6 max-w-sm w-full">
            <h3 className="font-bold text-gray-900 text-lg mb-1">Delete template?</h3>
            <p className="text-sm text-gray-500 mb-5">This cannot be undone. Any workouts already assigned from this template will not be affected.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
              <button
                onClick={() => confirmDelete(confirmDeleteId)}
                className="flex-1 btn bg-red-500 text-white hover:bg-red-600 active:scale-95"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
