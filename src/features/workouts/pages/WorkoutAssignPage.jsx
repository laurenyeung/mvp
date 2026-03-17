import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ArrowLeft, Calendar } from 'lucide-react'
import { coachApi } from '@/lib/api'
import { formatDate } from '@/lib/utils'

export default function WorkoutAssignPage() {
  const { id: clientId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [templateId, setTemplateId] = useState('')
  const [date, setDate] = useState('')
  const [name, setName] = useState('')

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: () => coachApi.listTemplates().then(r => r.data.data),
  })

  const { data: client } = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => coachApi.getClient(clientId).then(r => r.data.data),
  })

  const { mutate, isPending, error } = useMutation({
    mutationFn: () => coachApi.assignWorkout({ template_id: templateId, client_id: clientId, scheduled_date: date, name: name || undefined }),
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

      <div className="card p-5 space-y-4">
        <div>
          <label className="label">Template *</label>
          <select value={templateId} onChange={e => setTemplateId(e.target.value)} className="input">
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
