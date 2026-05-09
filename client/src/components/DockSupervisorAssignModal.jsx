import { useState, useEffect } from 'react'
import api from '../api'

const STATUS_BG  = { green: 'bg-green-500', orange: 'bg-orange-500', red: 'bg-red-500' }
const STATUS_LBL = { green: 'Empty', orange: 'Vehicle Assigned', red: 'In Progress (Gate Open)' }

export default function DockSupervisorAssignModal({ dock, onClose, onSaved }) {
  const [supervisors, setSupervisors] = useState([])
  const [allDocks, setAllDocks] = useState([])
  const [selected, setSelected] = useState(dock.supervisor_id ? String(dock.supervisor_id) : '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/users/supervisors'),
      api.get('/docks'),
    ]).then(([s, d]) => { setSupervisors(s.data); setAllDocks(d.data) }).catch(() => {})
  }, [])

  // Check if the selected supervisor's current dock is red (in-progress) → cannot move
  const selectedSup = supervisors.find(s => String(s.id) === selected)
  const selectedSupCurrentDock = selectedSup?.dock_id
    ? allDocks.find(d => d.id === selectedSup.dock_id)
    : null
  const isLocked = selectedSupCurrentDock && selectedSupCurrentDock.status === 'red'
    && selectedSupCurrentDock.id !== dock.id

  const save = async () => {
    if (isLocked) return
    setLoading(true); setError('')
    try {
      const newSupId = selected ? Number(selected) : null
      const oldSupId = dock.supervisor_id || null

      if (oldSupId && oldSupId !== newSupId) {
        await api.put(`/users/${oldSupId}/dock`, { dock_id: null })
      }
      if (newSupId) {
        await api.put(`/users/${newSupId}/dock`, { dock_id: dock.id })
      }
      onSaved()
    } catch (e) {
      setError(e.response?.data?.error || 'Save failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-5">

        <div className={`${STATUS_BG[dock.status]} rounded-2xl px-5 py-4 text-white`}>
          <div className="flex items-center gap-2">
            <div className="text-3xl font-black">{dock.dock_no}</div>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${(dock.type||'inbound')==='outbound'?'bg-amber-100 text-amber-700':'bg-sky-100 text-sky-700'}`}>
              {(dock.type||'inbound')==='outbound'?'📤 OUT':'📥 IN'}
            </span>
          </div>
          <div className="text-white/80 text-sm font-semibold">{STATUS_LBL[dock.status]}</div>
          {dock.vehicle_no && <div className="text-white text-sm mt-1">🚛 {dock.vehicle_no}</div>}
        </div>

        <div>
          <div className="text-xs font-semibold text-gray-400 mb-1">CURRENT SUPERVISOR</div>
          {dock.supervisor_name
            ? <div className="font-bold text-gray-800">👤 {dock.supervisor_name}</div>
            : <div className="text-amber-500 font-semibold text-sm">⚠️ Not assigned</div>
          }
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-500 mb-1.5">Assign Supervisor</label>
          <select value={selected} onChange={e => setSelected(e.target.value)}
            className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 focus:border-indigo-500 outline-none text-base">
            <option value="">— Remove assignment —</option>
            {supervisors.map(s => {
              const sDock = s.dock_id ? allDocks.find(d => d.id === s.dock_id) : null
              const isRed = sDock && sDock.status === 'red' && sDock.id !== dock.id
              return (
                <option key={s.id} value={s.id} disabled={isRed}>
                  {s.name}
                  {sDock && sDock.id !== dock.id ? ` (${sDock.dock_no}${isRed ? ' 🔴 IN PROGRESS' : ''})` : ''}
                </option>
              )
            })}
          </select>
          {supervisors.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">No dock supervisors found — create them in Admin → Users</p>
          )}
        </div>

        {isLocked && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-3 text-sm text-red-700">
            🔴 <strong>{selectedSup?.name}</strong> is on <strong>{selectedSupCurrentDock?.dock_no}</strong> which has a vehicle actively in progress. Complete or reject the vehicle first before reassigning.
          </div>
        )}

        {error && <p className="text-red-500 text-sm font-medium">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-2xl">
            Cancel
          </button>
          <button onClick={save} disabled={loading || isLocked}
            className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-2xl disabled:opacity-40 transition">
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
