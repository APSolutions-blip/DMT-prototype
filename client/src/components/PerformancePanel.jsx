import { useEffect, useState, useCallback } from 'react'
import api from '../api'
import socket from '../socket'

function todayStr() { return new Date().toISOString().split('T')[0] }
function daysAgoStr(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0] }

const RANGE_OPTS = [
  { id: 'today',  label: 'Today',       from: () => todayStr(),    to: () => todayStr() },
  { id: '7d',     label: 'Last 7 days', from: () => daysAgoStr(6), to: () => todayStr() },
  { id: '30d',    label: 'Last 30 days',from: () => daysAgoStr(29),to: () => todayStr() },
  { id: 'all',    label: 'All time',    from: () => null,          to: () => null },
]

function fmtMin(mins) {
  if (mins == null || mins === 0) return '—'
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

const DOCK_DOT = { green: 'bg-green-500', orange: 'bg-orange-500', red: 'bg-red-500' }

export default function PerformancePanel() {
  const [range, setRange] = useState('today')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    const opt = RANGE_OPTS.find(r => r.id === range)
    const from = opt.from(); const to = opt.to()
    setLoading(true); setError(null)
    try {
      const q = from && to ? `?from=${from}&to=${to}` : ''
      const res = await api.get(`/stats/performance${q}`)
      setData(res.data)
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load stats')
    }
    finally { setLoading(false) }
  }, [range])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    socket.on('data_changed', load)
    return () => socket.off('data_changed', load)
  }, [load])

  const topSupervisor = data?.supervisors?.slice().sort((a, b) => (b.processed || 0) - (a.processed || 0))[0]
  const bestDock = data?.docks?.slice().sort((a, b) => (b.processed || 0) - (a.processed || 0))[0]

  return (
    <div className="bg-white rounded-3xl shadow p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-black text-gray-700">📈 Performance</h2>
        <div className="flex bg-gray-100 rounded-xl overflow-hidden">
          {RANGE_OPTS.map(r => (
            <button key={r.id} onClick={() => setRange(r.id)}
              className={`px-2.5 py-1 text-xs font-bold transition ${range === r.id ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <div className="text-center py-6 text-gray-400 text-sm">Loading…</div>
      ) : error ? (
        <div className="text-center py-6 text-red-400 text-sm">⚠️ {error}</div>
      ) : !data ? (
        <div className="text-center py-6 text-gray-400 text-sm">No data</div>
      ) : (
        <>
          {/* Totals row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Total" value={data.totals.total} color="text-gray-800" />
            <Stat label="Departed" value={(data.totals.departed || 0)} color="text-green-600" />
            <Stat label="On Site" value={(data.totals.active || 0) + (data.totals.offloaded || 0)} color="text-orange-600" />
            <Stat label="Waiting / Hold" value={data.totals.waiting || 0} color="text-amber-500" />
          </div>

          {/* Secondary stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-3 text-center">
              <div className="text-xs font-bold text-indigo-600">AVG TIME ON SITE</div>
              <div className="text-xl font-black text-indigo-800">{fmtMin(data.totals.avg_total_min)}</div>
              <div className="text-[10px] text-indigo-400">departed vehicles only</div>
            </div>
            {(data.totals.rejected || 0) > 0 ? (
              <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-3 text-center">
                <div className="text-xs font-bold text-red-600">REJECTED DEPARTED</div>
                <div className="text-xl font-black text-red-800">{data.totals.rejected}</div>
                <div className="text-[10px] text-red-400">vehicles rejected & departed</div>
              </div>
            ) : (
              <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-3 text-center">
                <div className="text-xs font-bold text-green-600">PENDING DEPARTURE</div>
                <div className="text-xl font-black text-green-800">{data.totals.offloaded || 0}</div>
                <div className="text-[10px] text-green-400">offloaded, awaiting security</div>
              </div>
            )}
          </div>

          {/* Highlights */}
          {(bestDock?.processed > 0 || topSupervisor?.processed > 0) && (
            <div className="grid grid-cols-2 gap-2">
              {bestDock?.processed > 0 && (
                <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-3">
                  <div className="text-[10px] font-bold text-green-600">🏆 TOP DOCK</div>
                  <div className="font-black text-green-800">{bestDock.dock_no}</div>
                  <div className="text-xs text-gray-500">{bestDock.processed} processed</div>
                </div>
              )}
              {topSupervisor?.processed > 0 && (
                <div className="bg-purple-50 border-2 border-purple-200 rounded-2xl p-3">
                  <div className="text-[10px] font-bold text-purple-600">⭐ TOP SUPERVISOR</div>
                  <div className="font-black text-purple-800 truncate">{topSupervisor.name}</div>
                  <div className="text-xs text-gray-500">{topSupervisor.processed} processed</div>
                </div>
              )}
            </div>
          )}

          {/* Dock breakdown */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 mb-2">DOCKS</h3>
            <div className="space-y-1.5">
              {data.docks.length === 0 && <p className="text-xs text-gray-400">No docks configured</p>}
              {data.docks.map(d => (
                <div key={d.id} className={`flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2 ${!d.active ? 'opacity-50' : ''}`}>
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${d.active ? (DOCK_DOT[d.status] || 'bg-gray-400') : 'bg-gray-300'}`} />
                  <div className="font-black text-gray-800 w-14 text-sm flex-shrink-0">{d.dock_no}</div>
                  <span className={`text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${(d.type||'inbound')==='outbound' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                    {(d.type||'inbound')==='outbound' ? 'OUT' : 'IN'}
                  </span>
                  <div className="flex-1 text-xs text-gray-500">
                    <span className="font-bold text-gray-800">{d.processed || 0}</span>
                    {' '}processed · avg {(d.type||'inbound')==='outbound' ? 'load' : 'unload'}{' '}
                    <span className="font-bold text-gray-800">{fmtMin(d.avg_process_min)}</span>
                  </div>
                  {d.current_load > 0 && (
                    <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold flex-shrink-0">{d.current_load} active</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Supervisor breakdown */}
          <div>
            <h3 className="text-xs font-bold text-gray-500 mb-2">SUPERVISORS</h3>
            <div className="space-y-1.5">
              {data.supervisors.length === 0 && <p className="text-xs text-gray-400">No supervisors assigned to docks</p>}
              {data.supervisors.map(s => (
                <div key={s.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
                  <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-black flex-shrink-0">
                    {s.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-800 text-sm truncate">{s.name}</div>
                    <div className="text-xs text-gray-500">
                      {s.dock_no ? `🏭 ${s.dock_no}` : 'No dock assigned'}
                      {s.avg_process_min ? ` · avg ${(s.dock_type||'inbound')==='outbound'?'load':'unload'} ${fmtMin(s.avg_process_min)}` : ''}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-black text-gray-800">{s.processed || 0}</div>
                    <div className="text-[10px] text-gray-400">PROCESSED</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div className="bg-gray-50 rounded-2xl p-3 text-center">
      <div className={`text-2xl font-black ${color}`}>{value ?? 0}</div>
      <div className="text-[10px] font-bold text-gray-400 mt-0.5">{label.toUpperCase()}</div>
    </div>
  )
}
