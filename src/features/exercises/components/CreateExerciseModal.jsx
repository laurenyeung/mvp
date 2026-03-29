import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { exerciseSchema } from '@/lib/validationSchemas'
import { exercisesApi } from '@/lib/api'

export default function CreateExerciseModal({ onClose }) {
  const qc = useQueryClient()
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(exerciseSchema),
    defaultValues: { is_public: false },
  })

  const { mutate, isPending, error } = useMutation({
    mutationFn: (data) => exercisesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exercises'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md border border-pixel-border shadow-card-hover max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-pixel-border shrink-0">
          <h2 className="font-semibold text-gray-900">New Exercise</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit(d => mutate(d))} className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="label">Name *</label>
            <input {...register('name')} className="input" placeholder="e.g. Barbell Back Squat" />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>

          <div>
            <label className="label">Description</label>
            <textarea {...register('description')} className="input min-h-[80px] resize-none" placeholder="Optional notes…" />
          </div>

          <div>
            <label className="label">YouTube Demo URL <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              {...register('youtube_url')}
              className="input"
              placeholder="https://youtube.com/shorts/…"
            />
            <p className="text-xs text-gray-400 mt-1">Paste a YouTube Short or video link — it will play as a looping demo on the exercise card.</p>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input {...register('is_public')} type="checkbox" className="rounded" />
            Make public (visible to all coaches)
          </label>

          {error && (
            <p className="text-red-500 text-sm">{error.response?.data?.error?.message || 'Something went wrong'}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={isPending} className="btn-primary flex-1">
              {isPending ? 'Saving…' : 'Create Exercise'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
