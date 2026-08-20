import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Dumbbell, Pencil } from 'lucide-react'
import { seriesApi } from '@/lib/api'
import { useAuthStore } from '@/features/auth/store/authStore'
import YouTubeDemoEmbed from '@/components/shared/YouTubeDemoEmbed.jsx'
import SeriesBuilderModal from '../components/SeriesBuilderModal.jsx'

export default function SeriesDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isCoach = user?.role !== 'CLIENT'
  const [editing, setEditing] = useState(false)

  const { data: series, isLoading } = useQuery({
    queryKey: ['series', id],
    queryFn: () => seriesApi.get(id).then(r => r.data.data),
  })

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse h-20 bg-gray-100" />
          ))}
        </div>
      </div>
    )
  }

  if (!series) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 text-center text-gray-400 py-20">
        <p>Series not found</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button onClick={() => navigate('/series')} className="btn-ghost gap-2 mb-4 -ml-2">
        <ArrowLeft size={16} /> Back
      </button>

      <div className="flex items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="page-header">{series.title}</h1>
          {series.description && (
            <p className="text-sm text-gray-500 mt-1">{series.description}</p>
          )}
        </div>
        {isCoach && (
          <button onClick={() => setEditing(true)} className="btn-secondary gap-1.5 py-1.5 px-3 shrink-0">
            <Pencil size={14} /> Edit
          </button>
        )}
      </div>

      {series.exercises?.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Dumbbell size={40} className="mx-auto mb-3 opacity-30" />
          <p>No exercises in this series yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {series.exercises?.map((ex, i) => (
            <div key={ex.id} className="card overflow-hidden">
              <div className="flex items-start gap-3 p-4">
                <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold text-brand-600">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{ex.name}</p>
                  {ex.description && (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{ex.description}</p>
                  )}
                </div>
              </div>
              {ex.youtube_url && (
                <div className="px-4 pb-3">
                  <YouTubeDemoEmbed youtubeUrl={ex.youtube_url} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <SeriesBuilderModal series={series} onClose={() => setEditing(false)} />
      )}
    </div>
  )
}
