import { useState, useEffect } from 'react'
import api from '../api'

export default function DockAssignment() {
  const [supervisors, setSupervisors] = useState([])
  const [docks, setDocks] = useState([])
  const [editing, setEditing] = useState(null)   // supervisor id being edited
  const [selected, setSelected] = useState('')   // selected dock_id
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = async () => {
    const [s, d] = await Promise.all([api.get('/users/supervisors'), api.get('/docks')])
    setSupervisors(s.data)
    setDocks(d.data.filter(d => d.active))
  }

  useEffect(() => { load() }, [])

  // Which dock IDs are already taken (excluding the one being edited)
  const takenDockIds = supervisors
    .filter(s => s.dock_id && s.id !== editing)
    .map(s => s.dock_id)

  const startEdit = (sup) => {
    setEditing(sup.id)
    setSelected(sup.dock_id ? String(sup.dock_id) : '')
    setError(''); setSuccess('')
  }

  const save = async () => {
    setLoading(true); setError(''); setSuccess('')
    try {
      await api.put(`/users/${editing}/dock`, { dock_id: selected ? Number(selected) : null })
      setSuccess('Dock assignment saved!')
      setEditing(null)
      await load()
    } catch (e) {
      setError(e.response?.data?.error || 'Save failed')
    } finally { setLoading(false) }
  }

  const unassign = async (supId) => {
    setLoading(true)
    try {
      await api.put(`/users/${supId}/dock`, { dock_id: null })
      await load()
    } catch (e) { alert(e.response?.data?.error || 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 text-sm text-blue-700">
        ℹ️ Each dock can only be assigned to <strong>one supervisor</strong>. Docks already assigned to someone are greyed out.
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-sm text-green-700 font-semibold">
          ✅ {success}
        </div>
      )}

      {supervisors.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <div className="text-4xl mb-2">🏭</div>
          <p>No dock supervisors found.</p>
          <p className="text-sm mt-1">Ask admin to create dock supervisor accounts.</p>
        </div>
      )}

      <div className="space-y-2">
        {supervisors.map(sup => (
          <div key={sup.id} className="bg-white rounded-2xl shadow p-4">
            {editing === sup.id ? (
              /* Edit mode */
              <div className="space-y-3">
                <div className="font-black text-gray-800">{sup.name}</div>
                <div>
                  <label className="block text-sm font-semibold text-gray-500 mb-1.5">Assign Dock</label>
                  <select
                    value={selected}
                    onChange={e => setSelected(e.target.value)}
                    className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 focus:border-indigo-500 outline-none"
                  >
                    <option value="">— No dock (unassigned) —</option>
                    {docks.map(d => (
                      <option
                        key={d.id}
                        value={d.id}
                        disabled={takenDockIds.includes(d.id)}
                      >
                        {d.dock_no}
                        {d.supervisor_name ? ` · ${d.supervisor_name}` : ''}
                        {takenDockIds.includes(d.id) ? ' ✗ already assigned' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
                <div className="flex gap-3">
                  <button onClick={() => setEditing(null)} className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-2xl">
                    Cancel
                  </button>
                  <button onClick={save} disabled={loading} className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-2xl disabled:opacity-40">
                    {loading ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              /* View mode */
              <div className="flex items-center gap-3">
                <div className="text-2xl flex-shrink-0">🏭</div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-gray-800">{sup.name}</div>
                  <div className="text-sm text-gray-500">@{sup.username}</div>
                  {sup.assigned_dock_no ? (
                    <div className="text-sm font-bold text-teal-600 mt-0.5">📍 Dock {sup.assigned_dock_no}</div>
                  ) : (
                    <div className="text-sm text-amber-500 font-semibold mt-0.5">⚠️ No dock assigned</div>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => startEdit(sup)}
                    className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-bold px-3 py-2 rounded-xl text-sm transition">
                    ✏️ Assign
                  </button>
                  {sup.dock_id && (
                    <button onClick={() => unassign(sup.id)} disabled={loading}
                      className="bg-red-50 hover:bg-red-100 text-red-500 font-bold px-3 py-2 rounded-xl text-sm transition disabled:opacity-40">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
