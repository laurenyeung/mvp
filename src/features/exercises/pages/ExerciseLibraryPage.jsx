import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Dumbbell, X, ChevronDown, ChevronUp, Pencil } from 'lucide-react'
import { exercisesApi } from '@/lib/api'
import { useAuthStore } from '@/features/auth/store/authStore'
import CreateExerciseModal from '../components/CreateExerciseModal.jsx'

function getYouTubeId(url) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

function ExerciseCard({ ex, user, onEdit }) {
  const [demoOpen, setDemoOpen] = useState(false)
  const ytId = getYouTubeId(ex.youtube_url)
  const qc = useQueryClient()
  const isOwner = user?.id && ex.created_by === user.id

  const { mutate: togglePublic, isPending: togglingPublic } = useMutation({
    mutationFn: () => exercisesApi.update(ex.id, { is_public: !ex.is_public }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exercises'] }),
  })

  return (
    <div className="card overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0 mt-0.5">
          <Dumbbell size={18} className="text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-gray-900 text-sm">{ex.name}</p>
            <div className="flex items-center gap-2 shrink-0">
              {ex.is_public && (
                <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                  Public
                </span>
              )}
              {isOwner && (
                <button onClick={() => onEdit(ex)} className="btn-ghost p-1">
                  <Pencil size={13} />
                </button>
              )}
            </div>
          </div>
          {ex.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{ex.description}</p>
          )}
        </div>
      </div>

      {ytId && (
        <div className="px-4 pb-3">
          <button
            onClick={() => setDemoOpen(o => !o)}
            className="w-full flex items-center justify-between bg-orange-50 rounded-lg px-3 py-2"
          >
            <p className="text-xs font-medium text-orange-600">Example Video</p>
            {demoOpen ? <ChevronUp size={13} className="text-orange-400" /> : <ChevronDown size={13} className="text-orange-400" />}
          </button>
          {demoOpen && (
            <div className="flex justify-center mt-2">
              <div className="relative rounded-xl overflow-hidden bg-black" style={{ width: '180px', aspectRatio: '9/16' }}>
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

      {isOwner && (
        <div className="px-4 pb-3 border-t border-gray-100 pt-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={ex.is_public}
              onChange={() => togglePublic()}
              disabled={togglingPublic}
              className="rounded"
            />
            Visible to all coaches (public)
          </label>
        </div>
      )}
    </div>
  )
}

export default function ExerciseLibraryPage() {
  const { user } = useAuthStore()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editExercise, setEditExercise] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['exercises', search],
    queryFn: () => exercisesApi.list({ search, limit: 40 }).then(r => r.data.data),
  })

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="page-header">Exercise Library</h1>
        {user?.role !== 'CLIENT' && (
          <button onClick={() => setShowCreate(true)} className="btn-primary gap-2">
            <Plus size={16} /> Add
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search exercises…"
          className="input pl-10"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            <X size={16} />
          </button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse h-20 bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {data?.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Dumbbell size={40} className="mx-auto mb-3 opacity-30" />
              <p>No exercises found</p>
            </div>
          )}
          {data?.map(ex => <ExerciseCard key={ex.id} ex={ex} user={user} onEdit={setEditExercise} />)}
        </div>
      )}

      {showCreate && <CreateExerciseModal onClose={() => setShowCreate(false)} />}
      {editExercise && <CreateExerciseModal exercise={editExercise} onClose={() => setEditExercise(null)} />}
    </div>
  )
}
