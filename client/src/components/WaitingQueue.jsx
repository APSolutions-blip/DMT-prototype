function elapsed(ts) {
  const mins = Math.round((Date.now() - new Date(ts)) / 60000)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default function WaitingQueue({ queue, docks = [] }) {
  const freeDocks = docks.filter(d => d.status === 'green').length

  if (queue.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-5xl mb-3">✅</div>
        <p className="font-medium">No vehicles waiting</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {freeDocks === 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl px-4 py-3 text-amber-800 text-sm font-semibold">
          ⚠️ All docks occupied — {queue.length} vehicle{queue.length > 1 ? 's' : ''} in queue
        </div>
      )}
      {queue.map((v, i) => (
        <div key={v.id} className="bg-white rounded-2xl shadow p-4 flex items-center gap-4">
          <div className="text-3xl font-black text-gray-200 w-9 text-center">#{i + 1}</div>
          <div className="flex-1 min-w-0">
            <div className="text-xl font-black text-gray-800">{v.vehicle_no}</div>
            <div className="text-sm text-gray-500 mt-0.5">
              Arrived {new Date(v.arrival_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="text-xs text-amber-600 font-semibold mt-0.5">
              ⏳ Waiting {elapsed(v.queued_at)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
