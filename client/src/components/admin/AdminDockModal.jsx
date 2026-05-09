import { useState } from 'react'
import api from '../../api'

const STATUS_BG = { green: 'bg-green-500', orange: 'bg-orange-500', red: 'bg-red-500' }

export default function AdminDockModal({ dock, vehicle, allDocks, queuedVehicles, onClose, onAction }) {
  const [targetDock, setTargetDock] = useState('')
  const [targetVehicle, setTargetVehicle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const moveVehicle = async () => {
    if (!targetDock) { setError('Select a dock'); return }
    setLoading(true); setError('')
    try {
      await api.post(`/vehicles/${vehicle.id}/assign-dock`, { dock_id: Number(targetDock) })
      onAction()
    } catch (e) {
      setError(e.response?.data?.error || 'Failed')
      setLoading(false)
    }
  }

  const assignWaiting = async () => {
    if (!targetVehicle) { setError('Select a vehicle'); return }
    setLoading(true); setError('')
    try {
      await api.post(`/vehicles/${targetVehicle}/assign-dock`, { dock_id: dock.id })
      onAction()
    } catch (e) {
      setError(e.response?.data?.error || 'Failed')
      setLoading(false)
    }
  }

  const freeDocks = allDocks.filter(d => d.id !== dock.id && d.status === 'green')

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className={`${STATUS_BG[dock.status]} rounded-t-3xl sm:rounded-t-3xl px-5 py-4 flex items-center justify-between`}>
          <div>
            <div className="text-white text-4xl font-black">{dock.dock_no}</div>
            <div className="text-white/75 text-sm">Admin Override</div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-4xl w-12 h-12 flex items-center justify-center">×</button>
        </div>

        <div className="p-5 space-y-5">
          {vehicle && (
            <div className="bg-gray-50 rounded-2xl p-4">
              <div className="text-xl font-black text-gray-800">{vehicle.vehicle_no}</div>
              <div className="text-sm text-gray-500 mt-0.5">Status: <span className="font-semibold capitalize">{vehicle.vehicle_status || vehicle.status}</span></div>
            </div>
          )}

          {/* Move existing vehicle to another dock */}
          {vehicle && freeDocks.length > 0 && (
            <div>
              <h3 className="font-black text-gray-700 mb-2">Move Vehicle to Another Dock</h3>
              <select value={targetDock} onChange={e => setTargetDock(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-3 outline-none focus:border-purple-500">
                <option value="">— Select empty dock —</option>
                {freeDocks.map(d => <option key={d.id} value={d.id}>{d.dock_no} (Empty)</option>)}
              </select>
              <button onClick={moveVehicle} disabled={loading || !targetDock}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-2xl disabled:opacity-40 transition">
                🔄 Move to Selected Dock
              </button>
            </div>
          )}

          {/* Assign waiting vehicle to this empty dock */}
          {dock.status === 'green' && queuedVehicles.length > 0 && (
            <div>
              <h3 className="font-black text-gray-700 mb-2">Assign Waiting Vehicle Here</h3>
              <select value={targetVehicle} onChange={e => setTargetVehicle(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 mb-3 outline-none focus:border-purple-500">
                <option value="">— Select vehicle —</option>
                {queuedVehicles.map((v, i) => <option key={v.id} value={v.id}>#{i + 1} {v.vehicle_no}</option>)}
              </select>
              <button onClick={assignWaiting} disabled={loading || !targetVehicle}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3.5 rounded-2xl disabled:opacity-40 transition">
                ✅ Assign to {dock.dock_no}
              </button>
            </div>
          )}

          {dock.status === 'green' && queuedVehicles.length === 0 && !vehicle && (
            <div className="text-center py-6 text-gray-400">
              <div className="text-4xl mb-2">✅</div>
              <p className="font-medium">Dock is empty — no pending actions</p>
            </div>
          )}

          {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
        </div>
      </div>
    </div>
  )
}
