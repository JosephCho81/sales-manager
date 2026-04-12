'use client'

type Props = {
  activeMode: 'month' | 'range' | 'year'
  setActiveMode: (m: 'month' | 'range' | 'year') => void
  monthVal: string; setMonthVal: (v: string) => void
  fromVal: string;  setFromVal:  (v: string) => void
  toVal: string;    setToVal:    (v: string) => void
  yearVal: string;  setYearVal:  (v: string) => void
  yearOptions: number[]
  onNavigate: () => void
  filterProduct: string
  filterBuyer: string
  /** 필터 변경 즉시 서버 이동 — 버튼 클릭 불필요 */
  onFilterChange: (product: string, buyer: string) => void
  availableProducts: [string, string][]
}

export default function DateControls({
  activeMode, setActiveMode,
  monthVal, setMonthVal, fromVal, setFromVal, toVal, setToVal, yearVal, setYearVal,
  yearOptions, onNavigate,
  filterProduct, filterBuyer, onFilterChange, availableProducts,
}: Props) {
  return (
    <div className="card p-3 mb-3">
      {/* 모드 탭 */}
      <div className="flex gap-1 mb-2">
        {([
          { key: 'month', label: '단일월' },
          { key: 'range', label: '기간' },
          { key: 'year',  label: '연도' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveMode(key)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              activeMode === key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 날짜 입력 + 조회 + 필터 */}
      <div className="flex items-end gap-2 flex-wrap">
        {activeMode === 'month' && (
          <input
            type="month"
            value={monthVal}
            onChange={e => setMonthVal(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
        {activeMode === 'range' && (
          <>
            <input
              type="month"
              value={fromVal}
              onChange={e => setFromVal(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-400 text-sm pb-0.5">~</span>
            <input
              type="month"
              value={toVal}
              onChange={e => setToVal(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </>
        )}
        {activeMode === 'year' && (
          <select
            value={yearVal}
            onChange={e => setYearVal(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {yearOptions.map(y => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
        )}
        <button
          onClick={onNavigate}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 font-medium"
        >
          조회
        </button>

        {/* 필터 — 변경 즉시 서버 이동 */}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <select
            value={filterProduct}
            onChange={e => onFilterChange(e.target.value, filterBuyer)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">전체 품목</option>
            {availableProducts.map(([name, display]) => (
              <option key={name} value={name}>{display}</option>
            ))}
          </select>
          <select
            value={filterBuyer}
            onChange={e => onFilterChange(filterProduct, e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">전체 납품처</option>
            <option value="동국제강">동국제강</option>
            <option value="현대제철">현대제철</option>
          </select>
        </div>
      </div>
    </div>
  )
}
