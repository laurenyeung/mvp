import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Dumbbell, X, Pencil } from 'lucide-react'
import { exercisesApi } from '@/lib/api'
import { useAuthStore } from '@/features/auth/store/authStore'
import { getYouTubeId } from '@/lib/youtube'
import YouTubeDemoEmbed from '@/components/shared/YouTubeDemoEmbed.jsx'
import Pager from '@/components/shared/Pager.jsx'
import CreateExerciseModal from '../components/CreateExerciseModal.jsx'

const PAGE_SIZE = 15

function ExerciseCard({ ex, user, onEdit }) {
  const ytId = getYouTubeId(ex.youtube_url)
  const isOwner = user?.id && ex.created_by === user.id

  return (
    <div className="card overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0 mt-0.5">
          <Dumbbell size={18} className="text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-gray-900 text-sm">{ex.name}</p>
            {isOwner && (
              <button onClick={() => onEdit(ex)} className="btn-ghost p-1 shrink-0">
                <Pencil size={13} />
              </button>
            )}
          </div>
          {ex.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{ex.description}</p>
          )}
        </div>
      </div>

      {ytId && (
        <div className="px-4 pb-3">
          <YouTubeDemoEmbed youtubeUrl={ex.youtube_url} />
        </div>
      )}
    </div>
  )
}

export default function ExerciseLibraryPage() {
  const { user } = useAuthStore()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [editExercise, setEditExercise] = useState(null)

  const { data: result, isLoading } = useQuery({
    queryKey: ['exercises', search, page],
    queryFn: () => exercisesApi.list({ search, limit: PAGE_SIZE, page }).then(r => r.data),
  })
  const data = result?.data
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / PAGE_SIZE))

  const handleSearchChange = (value) => {
    setSearch(value)
    setPage(1)
  }

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
          onChange={e => handleSearchChange(e.target.value)}
          placeholder="Search exercises…"
          className="input pl-10"
        />
        {search && (
          <button onClick={() => handleSearchChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
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

      <Pager page={page} totalPages={totalPages} onChange={setPage} />

      {showCreate && <CreateExerciseModal onClose={() => setShowCreate(false)} />}
      {editExercise && <CreateExerciseModal exercise={editExercise} onClose={() => setEditExercise(null)} />}
    </div>
  )
}
