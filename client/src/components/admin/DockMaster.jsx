import { useState, useEffect } from 'react'
import api from '../../api'
import BulkImport from '../BulkImport'

const STATUS_DOT = { green: 'bg-green-500', orange: 'bg-orange-500', red: 'bg-red-500' }

export default function DockMaster({ onRefresh, allowActivation = true }) {
  const [docks, setDocks] = useState([])
  const [editing, setEditing] = useState(null)
  const [dockNo, setDockNo] = useState('')
  const [dockType, setDockType] = useState('inbound')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState([])
  const [bulkLoading, setBulkLoading] = useState(false)

  const load = async () => {
    const { data } = await api.get(allowActivation ? '/docks?all=1' : '/docks')
    setDocks(data)
    setSelected([])
  }

  useEffect(() => { load() }, [])

  const startNew  = () => { setEditing('new'); setDockNo(''); setDockType('inbound'); setError('') }
  const startEdit = (d) => { setEditing(d.id); setDockNo(d.dock_no); setDockType(d.type || 'inbound'); setError('') }
  const cancel    = () => { setEditing(null); setError('') }

  const save = async () => {
    if (!dockNo.trim()) { setError('Dock number is required'); return }
    setLoading(true); setError('')
    try {
      const payload = { dock_no: dockNo.trim().toUpperCase(), type: dockType, active: 1 }
      if (editing === 'new') await api.post('/docks', payload)
      else await api.put(`/docks/${editing}`, payload)
      await load(); onRefresh(); cancel()
    } catch (e) {
      setError(e.response?.data?.error || 'Save failed')
    } finally { setLoading(false) }
  }

  const remove = async (id) => {
    if (!window.confirm('Deactivate this dock?')) return
    try { await api.delete(`/docks/${id}`); await load(); onRefresh() }
    catch (e) { alert(e.response?.data?.error || 'Cannot deactivate occupied dock') }
  }

  const toggleSelect = (id) => setSelected(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  )
  const selectAll = () => setSelected(docks.map(d => d.id))
  const clearSelect = () => setSelected([])

  const bulkToggle = async (active) => {
    if (selected.length === 0) return
    const verb = active ? 'activate' : 'deactivate'
    if (!window.confirm(`${verb.charAt(0).toUpperCase() + verb.slice(1)} ${selected.length} dock(s)?`)) return
    setBulkLoading(true)
    try {
      const { data } = await api.post('/docks/bulk-toggle', { ids: selected, active })
      if (data.errors?.length) alert('Some docks skipped:\n' + data.errors.join('\n'))
      await load(); onRefresh()
    } catch (e) { alert(e.response?.data?.error || 'Bulk toggle failed') }
    finally { setBulkLoading(false) }
  }

  return (
    <div className="space-y-4">
      <button onClick={startNew} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-2xl text-lg transition">
        ➕ Add New Dock
      </button>

      <BulkImport kind="docks" accent="purple" onDone={() => { load(); onRefresh?.() }} />

      {editing && (
        <div className="bg-white rounded-3xl shadow p-5 border-2 border-purple-200 space-y-3">
          <h3 className="font-black text-gray-800 text-lg">{editing === 'new' ? 'New Dock' : 'Edit Dock'}</h3>
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1">Dock Number *</label>
            <input
              value={dockNo}
              onChange={e => setDockNo(e.target.value.toUpperCase())}
              className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-lg font-bold focus:border-purple-500 outline-none"
              placeholder="e.g. D-01"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1">Dock Type *</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: 'inbound',  label: '📥 Inbound (Unload)' },
                { v: 'outbound', label: '📤 Outbound (Load)' },
              ].map(o => (
                <button key={o.v} type="button" onClick={() => setDockType(o.v)}
                  className={`py-3 rounded-2xl font-bold border-2 transition ${dockType === o.v ? 'border-purple-600 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-400'}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={cancel} className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-2xl">Cancel</button>
            <button onClick={save} disabled={loading} className="flex-1 bg-purple-600 text-white font-bold py-3 rounded-2xl disabled:opacity-40">
              {loading ? 'Saving...' : 'Save Dock'}
            </button>
          </div>
        </div>
      )}

      {/* Bulk selection toolbar */}
      {allowActivation && docks.length > 0 && (
        <div className="bg-white rounded-2xl shadow p-3 flex items-center gap-2 flex-wrap">
          <button onClick={selected.length === docks.length ? clearSelect : selectAll}
            className="text-xs font-bold px-3 py-1.5 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
            {selected.length === docks.length ? 'Deselect All' : 'Select All'}
          </button>
          {selected.length > 0 && (
            <>
              <span className="text-xs text-gray-500 font-semibold">{selected.length} selected</span>
              <button onClick={() => bulkToggle(true)} disabled={bulkLoading}
                className="text-xs font-bold px-3 py-1.5 rounded-xl bg-green-100 text-green-700 hover:bg-green-200 transition disabled:opacity-40">
                ✅ Activate
              </button>
              <button onClick={() => bulkToggle(false)} disabled={bulkLoading}
                className="text-xs font-bold px-3 py-1.5 rounded-xl bg-red-100 text-red-600 hover:bg-red-200 transition disabled:opacity-40">
                ⛔ Deactivate
              </button>
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        {docks.map(d => (
          <div key={d.id}
            className={`bg-white rounded-2xl shadow p-4 flex items-center gap-3 ${!d.active ? 'opacity-50' : ''}`}
            onClick={() => allowActivation && toggleSelect(d.id)}>
            {allowActivation && (
              <input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggleSelect(d.id)}
                onClick={e => e.stopPropagation()}
                className="w-4 h-4 accent-purple-600 flex-shrink-0" />
            )}
            <div className={`w-4 h-4 rounded-full flex-shrink-0 ${d.active ? (STATUS_DOT[d.status] || 'bg-gray-400') : 'bg-gray-300'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="font-black text-gray-800 text-lg">{d.dock_no}</div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ (d.type || 'inbound') === 'outbound' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                  {(d.type || 'inbound') === 'outbound' ? '📤 OUT' : '📥 IN'}
                </span>
              </div>
              <div className="text-xs text-gray-400">{d.active ? d.status : '⛔ Inactive'}</div>
            </div>
            <div className="flex gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
              {d.active ? (
                <>
                  <button onClick={() => startEdit(d)} className="bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl text-sm transition">✏️</button>
                  {allowActivation && d.status === 'green' && (
                    <button onClick={() => remove(d.id)} className="bg-red-50 hover:bg-red-100 text-red-500 px-3 py-2 rounded-xl text-sm transition">🗑️</button>
                  )}
                </>
              ) : allowActivation && (
                <button onClick={async () => { await api.put(`/docks/${d.id}`, { dock_no: d.dock_no, type: d.type || 'inbound', active: 1 }); load(); onRefresh() }}
                  className="bg-green-100 hover:bg-green-200 text-green-700 font-bold px-3 py-2 rounded-xl text-sm transition">
                  ✅ Activate
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
