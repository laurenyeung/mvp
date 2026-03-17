import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Users, ChevronRight, Search } from 'lucide-react'
import { useState } from 'react'
import { coachApi } from '@/lib/api'
import { getInitials } from '@/lib/utils'

export default function ClientRosterPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => coachApi.listClients().then(r => r.data.data),
  })

  const filtered = clients?.filter(c =>
    `${c.first_name} ${c.last_name}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-header">My Clients</h1>
        <span className="text-sm text-gray-400 font-medium">{clients?.length ?? 0} total</span>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clients…"
          className="input pl-10"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse h-20 bg-gray-100" />
          ))}
        </div>
      ) : filtered?.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Users size={40} className="mx-auto mb-3 opacity-30" />
          <p>No clients found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered?.map(c => (
            <button
              key={c.id}
              onClick={() => navigate(`/coach/clients/${c.id}`)}
              className="card p-4 flex items-center gap-3 w-full hover:shadow-md transition-shadow"
            >
              <div className="w-11 h-11 rounded-full bg-brand-100 flex items-center justify-center shrink-0 text-brand-700 font-bold text-sm">
                {getInitials(c.first_name, c.last_name)}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-semibold text-gray-900 text-sm">
                  {c.first_name} {c.last_name}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{c.email}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.upcoming_workouts > 0 && (
                  <span className="text-xs bg-brand-50 text-brand-600 font-medium px-2 py-0.5 rounded-full">
                    {c.upcoming_workouts} upcoming
                  </span>
                )}
                <ChevronRight size={16} className="text-gray-300" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
