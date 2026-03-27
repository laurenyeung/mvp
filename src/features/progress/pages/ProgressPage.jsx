import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { Plus, TrendingUp, X } from 'lucide-react'
import { clientApi } from '@/lib/api'
import { progressSchema } from '@/lib/validationSchemas'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

const METRIC_TYPES = ['WEIGHT', 'BODY_FAT', 'WAIST', 'CUSTOM']
const METRIC_UNITS = { WEIGHT: 'kg', BODY_FAT: '%', WAIST: 'cm', CUSTOM: '' }

function AddMetricModal({ onClose }) {
  const qc = useQueryClient()
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(progressSchema),
    defaultValues: {
      metric_type: 'WEIGHT',
      unit: 'kg',
      recorded_at: new Date().toISOString().split('T')[0],
    },
  })
  const metricType = watch('metric_type')

  const { mutate, isPending } = useMutation({
    mutationFn: (data) => clientApi.addProgress(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['progress'] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-md border border-pixel-border shadow-card-hover max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-pixel-border shrink-0">
          <h2 className="font-semibold text-gray-900">Log Metric</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(d => mutate(d))} className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="label">Metric Type</label>
            <select {...register('metric_type')} className="input">
              {METRIC_TYPES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {metricType === 'CUSTOM' && (
            <div>
              <label className="label">Label</label>
              <input {...register('metric_label')} className="input" placeholder="e.g. Chest measurement" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Value</label>
              <input {...register('value')} type="number" step="0.1" className="input" placeholder="0.0" />
              {errors.value && <p className="text-red-500 text-xs mt-1">{errors.value.message}</p>}
            </div>
            <div>
              <label className="label">Unit</label>
              <input
                {...register('unit')}
                className="input"
                defaultValue={METRIC_UNITS[metricType] || ''}
              />
            </div>
          </div>
          <div>
            <label className="label">Date</label>
            <input {...register('recorded_at')} type="date" className="input" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={isPending} className="btn-primary flex-1">
              {isPending ? 'Saving…' : 'Log Metric'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-pixel-border rounded shadow-card px-3 py-2 text-sm">
      <p className="text-gray-500 text-xs">{label}</p>
      <p className="font-bold text-gray-900">{payload[0].value} {payload[0].payload.unit}</p>
    </div>
  )
}

export default function ProgressPage() {
  const [activeMetric, setActiveMetric] = useState('WEIGHT')
  const [showAdd, setShowAdd] = useState(false)

  const { data: entries, isLoading } = useQuery({
    queryKey: ['progress', activeMetric],
    queryFn: () => clientApi.getProgress({ metric_type: activeMetric }).then(r => r.data.data),
  })

  const chartData = entries
    ?.slice()
    .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
    .map(e => ({
      date: new Date(e.recorded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      value: Number(e.value),
      unit: e.unit,
    }))

  const latest = entries?.[0]
  const oldest = entries?.[entries.length - 1]
  const delta = latest && oldest && latest.id !== oldest.id
    ? (Number(latest.value) - Number(oldest.value)).toFixed(1)
    : null

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-header">Progress</h1>
        <button onClick={() => setShowAdd(true)} className="btn-primary gap-2">
          <Plus size={16} /> Log
        </button>
      </div>

      {/* Metric type tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-none">
        {METRIC_TYPES.map(m => (
          <button
            key={m}
            onClick={() => setActiveMetric(m)}
            className={cn(
              'shrink-0 px-4 py-2 text-sm font-medium border-2 transition-colors',
              'font-mono uppercase tracking-wide',
              activeMetric === m
                ? 'bg-pixel-accent text-gray-900 border-pixel-accent'
                : 'bg-white text-gray-500 border-pixel-line hover:border-pixel-accent hover:text-pixel-dim'
            )}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {latest && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="card p-3 text-center">
            <p className="text-xl font-bold text-gray-900">{latest.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">Latest ({latest.unit})</p>
          </div>
          <div className="card p-3 text-center">
            <p className={cn('text-xl font-bold', delta < 0 ? 'text-green-500' : delta > 0 ? 'text-red-500' : 'text-gray-900')}>
              {delta != null ? (delta > 0 ? `+${delta}` : delta) : '—'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Total change</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-xl font-bold text-gray-900">{entries?.length ?? 0}</p>
            <p className="text-xs text-gray-400 mt-0.5">Entries</p>
          </div>
        </div>
      )}

      {/* Chart */}
      {isLoading ? (
        <div className="card p-5 h-52 animate-pulse bg-gray-100 mb-4" />
      ) : chartData?.length > 1 ? (
        <div className="card p-4 mb-5">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E8E8" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#737373' }} />
              <YAxis tick={{ fontSize: 11, fill: '#737373' }} domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#FF6200"
                strokeWidth={2}
                dot={{ r: 4, fill: '#FF6200', strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#D44500' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {/* Entry log */}
      <h2 className="section-title mb-3">History</h2>
      {entries?.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <TrendingUp size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No {activeMetric.toLowerCase()} entries yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries?.map(e => (
            <div key={e.id} className="card p-3.5 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900 text-sm">
                  {e.value} {e.unit}
                </p>
                {e.metric_label && <p className="text-xs text-gray-400">{e.metric_label}</p>}
              </div>
              <p className="text-xs text-gray-400">{formatDate(e.recorded_at)}</p>
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddMetricModal onClose={() => setShowAdd(false)} />}
    </div>
  )
}
