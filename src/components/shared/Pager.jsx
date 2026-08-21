import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pager({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-center gap-4 pt-4">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="btn-ghost p-2 disabled:opacity-30 disabled:pointer-events-none"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-sm text-gray-500">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="btn-ghost p-2 disabled:opacity-30 disabled:pointer-events-none"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
