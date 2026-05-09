import { useState, useEffect, useCallback } from 'react'
import api from '../../api'
import { STATUS, duration } from '../../constants'

function todayStr() { return new Date().toISOString().split('T')[0] }
function daysAgoStr(n) {
  const d = new Date(); d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

export default function VehicleLog() {
  const [vehicles, setVehicles] = useState([])
  const [from, setFrom] = useState(daysAgoStr(7))
  const [to, setTo]     = useState(todayStr())
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/vehicles/history?from=${from}&to=${to}`)
      .then(r => setVehicles(r.data))
      .finally(() => setLoading(false))
  }, [from, to])

  useEffect(() => { load() }, [load])

  const downloadExcel = async () => {
    setExporting(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/export/excel?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `vehicles_${from}_to_${to}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { alert('Export failed') }
    finally { setExporting(false) }
  }

  const deleteVehicle = async (v) => {
    if (!window.confirm(`Delete ${v.vehicle_no}? This cannot be undone.`)) return
    setDeleting(v.id)
    try {
      await api.delete(`/vehicles/${v.id}`)
      load()
    } catch (e) { alert(e.response?.data?.error || 'Delete failed') }
    finally { setDeleting(null) }
  }

  const canDelete = (v) => !['unloading', 'offloaded', 'departed'].includes(v.status)

  return (
    <div className="space-y-4">
      {/* Date range + Export */}
      <div className="bg-white rounded-2xl shadow p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-2xl px-3 py-2.5 focus:border-purple-500 outline-none text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-2xl px-3 py-2.5 focus:border-purple-500 outline-none text-sm" />
          </div>
        </div>
        <button onClick={downloadExcel} disabled={exporting || vehicles.length === 0}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-3 rounded-2xl disabled:opacity-40 transition flex items-center justify-center gap-2">
          {exporting ? '⏳ Exporting...' : '📊 Export Excel'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">Loading...</div>
      ) : vehicles.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <div className="text-4xl mb-2">📋</div>
          <p>No vehicles in this range</p>
        </div>
      ) : (
        <div>
          <div className="text-sm text-gray-400 font-semibold mb-2">{vehicles.length} records</div>
          <div className="space-y-2">
            {vehicles.map(v => (
              <div key={v.id} className="bg-white rounded-2xl shadow p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-black text-gray-800 text-lg">{v.vehicle_no}</div>
                    {v.shipment_no && <div className="text-sm text-gray-500">📦 {v.shipment_no}</div>}
                    <div className="text-xs text-gray-400 mt-0.5">
                      In: {new Date(v.arrival_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      {' · '}{new Date(v.arrival_time).toLocaleDateString('en-IN')}
                      {v.offload_time && ` · ${duration(v.arrival_time, v.offload_time)}`}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {v.dock_no && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold">🏭 {v.dock_no}</span>}
                      {v.registered_by_name && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-semibold">👤 {v.registered_by_name}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className={`text-xs font-black px-2 py-1 rounded-full text-white ${STATUS[v.status]?.color || 'bg-gray-400'}`}>
                      {STATUS[v.status]?.label || v.status}
                    </span>
                    {canDelete(v) && (
                      <button onClick={() => deleteVehicle(v)} disabled={deleting === v.id}
                        className="text-xs bg-red-50 hover:bg-red-100 text-red-600 font-bold px-2.5 py-1 rounded-xl disabled:opacity-40 transition">
                        {deleting === v.id ? '⏳' : '🗑️ Delete'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
