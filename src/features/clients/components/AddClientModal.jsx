import { useState, useRef, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { X, Search, UserPlus, Loader2 } from 'lucide-react'
import { coachApi } from '@/lib/api'
import { getInitials, cn } from '@/lib/utils'

export default function AddClientModal({ onClose }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const inputRef = useRef(null)

  const trimmed = search.trim()
  const isSearching = trimmed.length >= 2

  useEffect(() => { inputRef.current?.focus() }, [])

  const { data: results = [], isFetching, isSuccess } = useQuery({
    queryKey: ['client-search', trimmed],
    queryFn: () => coachApi.searchClients(trimmed).then(r => r.data.data),
    enabled: isSearching,
    // Keep previous results visible while new ones load (prevents flash of empty)
    placeholderData: keepPreviousData,
    // Short stale time so typing new chars always triggers a fresh fetch
    staleTime: 2_000,
  })

  const { mutate: addClient, isPending, error } = useMutation({
    mutationFn: () => coachApi.addClient(selected.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] })
      onClose()
    },
  })

  // Derive display state clearly
  const showResults  = isSearching
  const showEmpty    = isSearching && !isFetching && isSuccess && results.length === 0
  const showList     = isSearching && results.length > 0

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md border border-pixel-border shadow-card-hover max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-pixel-border shrink-0">
          <h2 className="font-semibold text-gray-900">Add Client</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <p className="text-sm text-gray-500">
            Search for a user who has already registered with a <strong>Client</strong> account.
          </p>

          {/* Search input */}
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            {isFetching && (
              <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
            )}
            <input
              ref={inputRef}
              value={search}
              onChange={e => { setSearch(e.target.value); setSelected(null) }}
              placeholder="Search by name or email…"
              className="input pl-10 pr-9"
            />
          </div>

          {/* Hint while typing */}
          {search.length > 0 && !isSearching && (
            <p className="text-xs text-gray-400">Keep typing to search…</p>
          )}

          {/* Results */}
          {showResults && (
            <div className="border border-gray-100 rounded-xl overflow-hidden">
              {showEmpty ? (
                <p className="text-sm text-gray-400 text-center py-5">
                  No unlinked clients found for &ldquo;{trimmed}&rdquo;
                </p>
              ) : showList ? (
                <div className="max-h-52 overflow-y-auto divide-y divide-gray-50">
                  {results.map(u => (
                    <button
                      key={u.id}
                      onClick={() => setSelected(u)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                        selected?.id === u.id ? 'bg-brand-50' : 'hover:bg-gray-50'
                      )}
                    >
                      <div className={cn(
                        'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-gray-900',
                        selected?.id === u.id
                          ? 'bg-pixel-accent'
                          : 'bg-gray-200'
                      )}
                      style={{}}>
                        {getInitials(u.first_name, u.last_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'text-sm font-semibold truncate',
                          selected?.id === u.id ? 'text-brand-700' : 'text-gray-900'
                        )}>
                          {u.first_name} {u.last_name}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{u.email}</p>
                      </div>
                      {selected?.id === u.id && (
                        <span className="text-xs font-medium text-brand-600 shrink-0">Selected ✓</span>
                      )}
                    </button>
                  ))}
                </div>
              ) : isFetching ? (
                <div className="flex items-center justify-center gap-2 py-5 text-sm text-gray-400">
                  <Loader2 size={14} className="animate-spin" /> Searching…
                </div>
              ) : null}
            </div>
          )}

          {/* Selected summary */}
          {selected && (
            <div className="bg-brand-50 border-2 border-pixel-accent rounded px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-pixel-accent flex items-center justify-center font-bold text-sm text-gray-900 shrink-0">
                {getInitials(selected.first_name, selected.last_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-brand-900 truncate">
                  {selected.first_name} {selected.last_name}
                </p>
                <p className="text-xs text-brand-600 truncate">{selected.email}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-brand-400 hover:text-brand-600 p-1">
                <X size={14} />
              </button>
            </div>
          )}

          {error && (
            <p className="text-red-500 text-sm">
              {error.response?.data?.error?.message || 'Failed to add client'}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button
              onClick={() => addClient()}
              disabled={!selected || isPending}
              className="btn-primary flex-1 gap-2"
            >
              {isPending
                ? <><Loader2 size={15} className="animate-spin" /> Adding…</>
                : <><UserPlus size={15} /> Add Client</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
