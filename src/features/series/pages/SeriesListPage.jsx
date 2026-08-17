import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Layers, ChevronRight } from 'lucide-react'
import { seriesApi } from '@/lib/api'
import { useAuthStore } from '@/features/auth/store/authStore'
import SeriesBuilderModal from '../components/SeriesBuilderModal.jsx'

export default function SeriesListPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isCoach = user?.role !== 'CLIENT'
  const [showCreate, setShowCreate] = useState(false)
  const [editSeries, setEditSeries] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const { data: series, isLoading } = useQuery({
    queryKey: ['series'],
    queryFn: () => seriesApi.list().then(r => r.data.data),
  })

  const { mutate: deleteSeries } = useMutation({
    mutationFn: (id) => seriesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['series'] }),
  })

  const confirmDelete = (id) => {
    deleteSeries(id)
    setConfirmDeleteId(null)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="page-header">Series</h1>
        {isCoach && (
          <button onClick={() => setShowCreate(true)} className="btn-primary gap-1.5 py-1.5 px-3">
            <Plus size={15} /> New
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse h-20 bg-gray-100" />
          ))}
        </div>
      ) : series?.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Layers size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No series yet</p>
          {isCoach && <p className="text-sm mt-1">Create your first exercise series</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {series?.map(s => (
            <div key={s.id} className="card p-4 flex items-center gap-3">
              <button
                onClick={() => navigate(`/series/${s.id}`)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                  <Layers size={18} className="text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{s.title}</p>
                  <span className="text-xs text-gray-400">{s.exercises?.length ?? 0} exercises</span>
                </div>
              </button>
              <div className="flex items-center gap-1">
                {isCoach && (
                  <button
                    onClick={() => setEditSeries(s)}
                    className="btn-ghost p-2 text-gray-400 hover:text-brand-600"
                  >
                    <ChevronRight size={18} />
                  </button>
                )}
                {isCoach && (
                  <button
                    onClick={() => setConfirmDeleteId(s.id)}
                    className="btn-ghost p-2 text-gray-400 hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {(showCreate || editSeries) && (
        <SeriesBuilderModal
          series={editSeries}
          onClose={() => { setShowCreate(false); setEditSeries(null) }}
        />
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] px-4">
          <div className="bg-white rounded-xl shadow-card border border-pixel-border p-6 max-w-sm w-full">
            <h3 className="font-bold text-gray-900 text-lg mb-1">Delete series?</h3>
            <p className="text-sm text-gray-500 mb-5">This cannot be undone.</p>
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
