import { useState, useEffect } from 'react'
import api from '../../api'
import BulkImport from '../BulkImport'
import { ROLE_LABELS } from '../../constants'

const ALL_ROLES = ['security', 'dock_supervisor', 'operation_manager', 'admin']
const ROLE_ICON = { admin: '🔧', security: '🔒', dock_supervisor: '🏭', operation_manager: '📊' }

const ACCENTS = {
  purple: { btn: 'bg-purple-600 hover:bg-purple-700', ring: 'border-purple-200', focus: 'focus:border-purple-500',
            active: 'border-purple-600 bg-purple-50 text-purple-700', text: 'text-purple-700' },
  indigo: { btn: 'bg-indigo-600 hover:bg-indigo-700', ring: 'border-indigo-200', focus: 'focus:border-indigo-500',
            active: 'border-indigo-600 bg-indigo-50 text-indigo-700', text: 'text-indigo-700' },
}

export default function UserMaster({ allowedRoles = ALL_ROLES, accent = 'purple' }) {
  const a = ACCENTS[accent] || ACCENTS.purple
  const EMPTY = { username: '', name: '', role: allowedRoles[0], password: '', active: 1 }

  const [users, setUsers] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState([])
  const [bulkLoading, setBulkLoading] = useState(false)

  const load = async () => {
    const { data } = await api.get('/users')
    setUsers(data.filter(u => allowedRoles.includes(u.role)))
    setSelected([])
  }
  useEffect(() => { load() }, [])

  const startNew  = () => { setEditing('new'); setForm(EMPTY); setError('') }
  const startEdit = (u) => {
    setEditing(u.id)
    setForm({ username: u.username, name: u.name, role: u.role, password: u.password_plain || '', active: u.active })
    setError('')
  }
  const cancel = () => { setEditing(null); setError('') }

  const save = async () => {
    if (!form.name.trim())                          { setError('Name required'); return }
    if (editing === 'new' && !form.username.trim()) { setError('Username required'); return }
    if (editing === 'new' && !form.password)        { setError('Password required'); return }
    setLoading(true); setError('')
    try {
      if (editing === 'new') await api.post('/users', form)
      else                   await api.put(`/users/${editing}`, form)
      await load(); cancel()
    } catch (e) { setError(e.response?.data?.error || 'Save failed') }
    finally { setLoading(false) }
  }

  const deleteUser = async (u) => {
    if (!window.confirm(`Delete ${u.name} (@${u.username})?`)) return
    setDeleting(u.id)
    try { await api.delete(`/users/${u.id}`); await load() }
    catch (e) { alert(e.response?.data?.error || 'Delete failed') }
    finally { setDeleting(null) }
  }

  const exportExcel = async () => {
    setExporting(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/export/users', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'users.xlsx'; anchor.click()
      URL.revokeObjectURL(url)
    } catch { alert('Export failed') }
    finally { setExporting(false) }
  }

  const toggleSelect = (id) => setSelected(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  )
  const selectAll = () => setSelected(users.map(u => u.id))
  const clearSelect = () => setSelected([])

  const bulkToggle = async (active) => {
    if (selected.length === 0) return
    const verb = active ? 'Activate' : 'Deactivate'
    if (!window.confirm(`${verb} ${selected.length} user(s)?`)) return
    setBulkLoading(true)
    try {
      await api.post('/users/bulk-toggle', { ids: selected, active })
      await load()
    } catch (e) { alert(e.response?.data?.error || 'Failed') }
    finally { setBulkLoading(false) }
  }

  const f = (key) => ({ value: form[key], onChange: e => setForm(p => ({ ...p, [key]: e.target.value })) })

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={startNew} className={`flex-1 ${a.btn} text-white font-bold py-3 rounded-2xl transition`}>
          ➕ Add New User
        </button>
        <button onClick={exportExcel} disabled={exporting}
          className="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-3 rounded-2xl transition disabled:opacity-40">
          {exporting ? '⏳' : '📊'} Excel
        </button>
      </div>

      <BulkImport kind="users" accent={accent} onDone={load} />

      {editing && (
        <div className={`bg-white rounded-3xl shadow p-5 border-2 ${a.ring} space-y-3`}>
          <h3 className="font-black text-gray-800 text-lg">{editing === 'new' ? 'New User' : 'Edit User'}</h3>

          {editing === 'new' && (
            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-1">Username *</label>
              <input {...f('username')} onChange={e => setForm(p => ({ ...p, username: e.target.value.toLowerCase().trim() }))}
                className={`w-full border-2 border-gray-200 rounded-2xl px-4 py-3 ${a.focus} outline-none`}
                placeholder="e.g. rahul.security" />
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1">Full Name *</label>
            <input {...f('name')} className={`w-full border-2 border-gray-200 rounded-2xl px-4 py-3 ${a.focus} outline-none`} placeholder="Full name" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1">Role *</label>
            <div className="grid grid-cols-2 gap-2">
              {allowedRoles.map(r => (
                <button key={r} type="button" onClick={() => setForm(p => ({ ...p, role: r }))}
                  className={`py-2.5 rounded-2xl font-bold text-sm border-2 transition ${form.role === r ? a.active : 'border-gray-200 text-gray-400'}`}>
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1">
              {editing === 'new' ? 'Password *' : 'Password'}
            </label>
            <input type="text" {...f('password')}
              className={`w-full border-2 border-gray-200 rounded-2xl px-4 py-3 ${a.focus} outline-none font-mono`}
              placeholder="Password" />
          </div>

          {editing !== 'new' && (
            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-1">Status</label>
              <div className="flex gap-3">
                {[1, 0].map(v => (
                  <button key={v} type="button" onClick={() => setForm(p => ({ ...p, active: v }))}
                    className={`flex-1 py-3 rounded-2xl font-bold border-2 transition ${form.active === v ? a.active : 'border-gray-200 text-gray-400'}`}>
                    {v ? '✅ Active' : '⛔ Inactive'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button onClick={cancel} className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-2xl">Cancel</button>
            <button onClick={save} disabled={loading} className={`flex-1 ${a.btn} text-white font-bold py-3 rounded-2xl disabled:opacity-40`}>
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Bulk selection toolbar */}
      {users.length > 0 && (
        <div className="bg-white rounded-2xl shadow p-3 flex items-center gap-2 flex-wrap">
          <button onClick={selected.length === users.length ? clearSelect : selectAll}
            className="text-xs font-bold px-3 py-1.5 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
            {selected.length === users.length ? 'Deselect All' : 'Select All'}
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
        {users.map(u => (
          <div key={u.id} className={`bg-white rounded-2xl shadow p-4 ${!u.active ? 'opacity-50' : ''} cursor-pointer`}
            onClick={() => toggleSelect(u.id)}>
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={selected.includes(u.id)} onChange={() => toggleSelect(u.id)}
                onClick={e => e.stopPropagation()}
                className="w-4 h-4 accent-indigo-600 flex-shrink-0" />
              <div className="text-2xl flex-shrink-0">{ROLE_ICON[u.role]}</div>
              <div className="flex-1 min-w-0">
                <div className="font-black text-gray-800">{u.name}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                  <span className="text-sm text-gray-500">@{u.username}</span>
                  {u.password_plain && (
                    <span className={`text-sm font-mono ${a.text}`}>🔑 {u.password_plain}</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{ROLE_LABELS[u.role]?.replace(/^\S+\s/, '')}</div>
                {u.assigned_dock_no && <div className="text-xs text-teal-600 font-semibold">🏭 Dock: {u.assigned_dock_no}</div>}
                {!u.active && <div className="text-xs text-red-500 font-bold">⛔ Inactive</div>}
              </div>
              <div className="flex gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                <button onClick={() => startEdit(u)}
                  className="bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-xl text-sm transition">✏️</button>
                {u.role !== 'admin' && (
                  <button onClick={() => deleteUser(u)} disabled={deleting === u.id}
                    className="bg-red-50 hover:bg-red-100 text-red-500 px-3 py-2 rounded-xl text-sm transition disabled:opacity-40">
                    {deleting === u.id ? '⏳' : '🗑️'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
