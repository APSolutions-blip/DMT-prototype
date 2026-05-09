const STATUS = {
  green:  { bg: 'bg-green-500',  ring: 'ring-green-700',  label: 'EMPTY',     icon: '✅' },
  orange: { bg: 'bg-orange-500', ring: 'ring-orange-700', label: 'ASSIGNED',  icon: '🟠' },
  red:    { bg: 'bg-red-500',    ring: 'ring-red-700',    label: 'UNLOADING', icon: '🔴' },
}

export default function DockGrid({ docks, onDockClick }) {
  if (docks.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-5xl mb-3">🏭</div>
        <p className="font-medium">No docks configured</p>
        <p className="text-sm">Ask admin to add docks in master settings</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex gap-4 mb-4 text-xs font-semibold text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" />Empty</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-500 inline-block" />Assigned</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />Unloading</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {docks.map(dock => {
          const s = STATUS[dock.status]
          return (
            <button
              key={dock.id}
              onClick={onDockClick ? () => onDockClick(dock) : undefined}
              className={`${s.bg} rounded-2xl p-4 text-left shadow-lg transition ring-4 ${s.ring} min-h-[100px] flex flex-col justify-between ${onDockClick ? 'active:scale-95' : 'cursor-default'}`}
            >
              <div>
                <div className="text-white text-2xl font-black leading-none">{dock.dock_no}</div>
                <div className="text-white/80 text-xs font-bold mt-1">{s.label}</div>
              </div>
              <div>
                {dock.vehicle_no
                  ? <div className="text-white text-sm font-bold truncate mt-2">🚛 {dock.vehicle_no}</div>
                  : onDockClick
                    ? <div className="text-white/50 text-xs mt-2">tap to manage</div>
                    : null
                }
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
