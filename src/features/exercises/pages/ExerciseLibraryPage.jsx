import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Dumbbell, X } from 'lucide-react'
import { exercisesApi } from '@/lib/api'
import { useAuthStore } from '@/features/auth/store/authStore'
import CreateExerciseModal from '../components/CreateExerciseModal.jsx'

export default function ExerciseLibraryPage() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['exercises', search],
    queryFn: () => exercisesApi.list({ search, limit: 40 }).then(r => r.data.data),
  })

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
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
          {data?.map(ex => (
            <div key={ex.id} className="card p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                <Dumbbell size={18} className="text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{ex.name}</p>
                {ex.description && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{ex.description}</p>
                )}
              </div>
              {ex.is_public && (
                <span className="shrink-0 text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                  Public
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateExerciseModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
