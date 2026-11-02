'use client'

import type { PeriodFilter, PeriodMode } from '@/lib/period'

export default function PeriodFilterBar({
  modes,
  value,
  onChange,
}: {
  modes: Array<{ mode: PeriodMode; label: string }>
  value: PeriodFilter
  onChange: (next: PeriodFilter) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-gray-200 overflow-hidden">
        {modes.map(m => (
          <button
            key={m.mode}
            type="button"
            onClick={() => onChange({ ...value, mode: m.mode })}
            className={`px-3 py-1.5 text-xs ${
              value.mode === m.mode ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {value.mode === 'month' && (
        <input
          type="month" className="input w-auto py-1 text-sm" value={value.from}
          onChange={e => e.target.value && onChange({ ...value, from: e.target.value })}
        />
      )}
      {value.mode === 'range' && (
        <>
          <input
            type="month" className="input w-auto py-1 text-sm" value={value.from}
            onChange={e => e.target.value && onChange({ ...value, from: e.target.value })}
          />
          <span className="text-xs text-gray-400">~</span>
          <input
            type="month" className="input w-auto py-1 text-sm" value={value.to}
            onChange={e => e.target.value && onChange({ ...value, to: e.target.value })}
          />
        </>
      )}
    </div>
  )
}
