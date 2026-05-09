import { useState } from 'react'
import api from '../api'

export default function DockOverrideModal({ vehicle, docks, onClose, onSaved }) {
  const [selectedDock, setSelectedDock] = useState(String(vehicle.assigned_dock_id || ''))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const availableDocks = docks.filter(d => d.status === 'green' || d.id === vehicle.assigned_dock_id)

  const save = async () => {
    if (!selectedDock) { setError('Select a dock'); return }
    if (Number(selectedDock) === vehicle.assigned_dock_id) { onClose(); return }
    setLoading(true); setError('')
    try {
      await api.post(`/vehicles/${vehicle.id}/assign-dock`, { dock_id: Number(selectedDock) })
      onSaved()
    } catch (e) {
      setError(e.response?.data?.error || 'Override failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-4">

        <div>
          <h3 className="font-black text-gray-800 text-lg">Override Dock Assignment</h3>
          <p className="text-sm text-gray-500 mt-0.5">Vehicle: <span className="font-bold text-gray-800">{vehicle.vehicle_no}</span></p>
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 text-sm text-orange-700">
          Currently assigned: <span className="font-black">{vehicle.dock_no || '—'}</span>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-500 mb-1.5">Reassign to Dock</label>
          {availableDocks.length === 0 ? (
            <p className="text-amber-600 text-sm font-semibold">⚠️ No free docks available</p>
          ) : (
            <div className="space-y-2">
              {availableDocks.map(d => (
                <button key={d.id} onClick={() => setSelectedDock(String(d.id))}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition text-left ${String(d.id) === selectedDock ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}>
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${d.id === vehicle.assigned_dock_id ? 'bg-orange-500' : 'bg-green-500'}`} />
                  <div>
                    <div className="font-black text-gray-800">{d.dock_no}</div>
                    {d.id === vehicle.assigned_dock_id && <div className="text-xs text-orange-500">Current</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-red-500 text-sm font-medium">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-2xl">Cancel</button>
          <button onClick={save} disabled={loading || !selectedDock || availableDocks.length === 0}
            className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-2xl disabled:opacity-40 transition">
            {loading ? 'Saving...' : 'Override'}
          </button>
        </div>
      </div>
    </div>
  )
}
