import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import socket from '../socket'
import WaitingQueue from '../components/WaitingQueue'
import DockSupervisorAssignModal from '../components/DockSupervisorAssignModal'
import DockOverrideModal from '../components/DockOverrideModal'
import VehicleJourneyModal from '../components/VehicleJourneyModal'
import UserMaster from '../components/admin/UserMaster'
import DockMaster from '../components/admin/DockMaster'
import PerformancePanel from '../components/PerformancePanel'
import WhatsAppLanguageModal from '../components/WhatsAppLanguageModal'
import { STATUS, PURPOSE_LABEL, elapsedTimer, duration } from '../constants'

const DOCK_BG   = { green: 'bg-green-500',  orange: 'bg-orange-500', red: 'bg-red-500' }
const DOCK_RING = { green: 'ring-green-700', orange: 'ring-orange-700', red: 'ring-red-700' }
const DOCK_LBL  = { green: 'EMPTY', orange: 'ASSIGNED', red: 'IN PROGRESS' }

function todayStr() { return new Date().toISOString().split('T')[0] }

// Live timer badge on dock card
function DockTimer({ dock }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])
  const ts = dock.status === 'orange' ? dock.assigned_time
           : dock.status === 'red'    ? dock.gate_open_time
           : null
  if (!ts) return null
  const t = elapsedTimer(ts)
  if (!t) return null
  return (
    <div className="text-white/90 text-[10px] font-bold mt-0.5">⏱ {t}</div>
  )
}

// Modal for OM to change the vehicle number on an approved outbound rejection.
// New plate takes over the shipment; old record stays as rejected_hold for
// Security to depart. driver_name / driver_mobile are optional — server falls
// back to the old record's values when left blank.
function SwapVehicleModal({ rejection, onClose, onDone }) {
  const [vehicleNo, setVehicleNo] = useState('')
  const [driverName, setDriverName] = useState('')
  const [driverMobile, setDriverMobile] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!vehicleNo.trim()) { setError('New vehicle number required'); return }
    if (driverMobile.trim() && !/^\d{10}$/.test(driverMobile.trim())) {
      setError('Mobile must be 10 digits'); return
    }
    setLoading(true); setError('')
    try {
      await api.post(`/rejections/${rejection.id}/swap-vehicle`, {
        new_vehicle_no: vehicleNo.trim().toUpperCase(),
        driver_name:    driverName.trim() || undefined,
        driver_mobile:  driverMobile.trim() || undefined,
      })
      onDone()
    } catch (e) {
      setError(e.response?.data?.error || 'Swap failed')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="bg-amber-600 rounded-t-3xl px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-white font-black text-lg">Swap Vehicle</div>
            <div className="text-white/80 text-sm">Shipment {rejection.shipment_no} · replacing {rejection.vehicle_no}</div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-4xl w-12 h-12 flex items-center justify-center">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-sm text-amber-700">
            The new vehicle will take over this shipment. The old vehicle <strong>{rejection.vehicle_no}</strong> stays as <em>Rejected — On Hold</em> until Security marks it departed.
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1.5">New Vehicle No. <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={vehicleNo}
              onChange={e => setVehicleNo(e.target.value.toUpperCase())}
              className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-xl font-black text-center uppercase tracking-widest focus:border-amber-500 outline-none"
              placeholder="MH 01 AB 5678"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1.5">Driver Name <span className="text-gray-400 text-xs">(optional)</span></label>
              <input
                type="text"
                value={driverName}
                onChange={e => setDriverName(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-2xl px-3 py-2.5 focus:border-amber-500 outline-none"
                placeholder="Keep old driver"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1.5">Driver Mobile <span className="text-gray-400 text-xs">(optional)</span></label>
              <input
                type="tel"
                value={driverMobile}
                onChange={e => setDriverMobile(e.target.value)}
                className="w-full border-2 border-gray-200 rounded-2xl px-3 py-2.5 focus:border-amber-500 outline-none"
                placeholder="Keep old mobile"
              />
            </div>
          </div>

          {error && <p className="text-red-500 text-sm font-medium">{error}</p>}

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-2xl">Cancel</button>
            <button onClick={submit} disabled={loading || !vehicleNo.trim()}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-2xl disabled:opacity-40 transition">
              {loading ? '⏳ Swapping...' : '🔄 Swap Vehicle'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Rejection workflow panel
function RejectionsPanel({ onRefresh }) {
  const [allRejections, setAllRejections] = useState([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(false)
  const [swapRejection, setSwapRejection] = useState(null)

  const load = useCallback(async () => {
    try {
      // Load all at once so we can show counts per tab
      const [p, a, r, d] = await Promise.all([
        api.get('/rejections?status=pending'),
        api.get('/rejections?status=approved'),
        api.get('/rejections?status=resolved'),
        api.get('/rejections?status=denied'),
      ])
      setAllRejections([
        ...p.data.map(x => ({ ...x, _tab: 'pending' })),
        ...a.data.map(x => ({ ...x, _tab: 'approved' })),
        ...r.data.map(x => ({ ...x, _tab: 'resolved' })),
        ...d.data.map(x => ({ ...x, _tab: 'denied' })),
      ])
    } catch {}
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    socket.on('data_changed', load)
    return () => socket.off('data_changed', load)
  }, [load])

  const decide = async (id, action) => {
    setLoading(true)
    try { await api.post(`/rejections/${id}/${action}`); load(); onRefresh() }
    catch (e) { alert(e.response?.data?.error || 'Failed') }
    finally { setLoading(false) }
  }

  const resolve = async (id) => {
    setLoading(true)
    try { await api.post(`/rejections/${id}/resolve`); load(); onRefresh() }
    catch (e) { alert(e.response?.data?.error || 'Failed') }
    finally { setLoading(false) }
  }

  const counts = {
    pending:  allRejections.filter(r => r._tab === 'pending').length,
    approved: allRejections.filter(r => r._tab === 'approved').length,
    resolved: allRejections.filter(r => r._tab === 'resolved').length,
    denied:   allRejections.filter(r => r._tab === 'denied').length,
  }

  const TABS = [
    { v: 'pending',  label: '⏳ Awaiting Decision', desc: 'Raised by supervisor — needs your approval or denial', activeClass: 'bg-rose-600 text-white' },
    { v: 'approved', label: '🔴 Approved — Action Needed', desc: 'You approved. Waiting for rectification or vehicle swap.', activeClass: 'bg-red-700 text-white' },
    { v: 'resolved', label: '✅ Resolved', desc: 'Issue resolved or vehicle swapped', activeClass: 'bg-green-600 text-white' },
    { v: 'denied',   label: '✗ Denied', desc: 'You denied the rejection — vehicle continued', activeClass: 'bg-gray-500 text-white' },
  ]

  const visible = allRejections.filter(r => r._tab === filter)

  return (
    <div className="space-y-3">

      {/* Tab bar */}
      <div className="bg-white rounded-2xl shadow overflow-hidden">
        {TABS.map(t => (
          <button key={t.v} onClick={() => setFilter(t.v)}
            className={`w-full flex items-center justify-between px-4 py-3 text-sm font-bold border-b last:border-0 transition text-left ${
              filter === t.v ? t.activeClass : 'text-gray-600 hover:bg-gray-50'
            }`}>
            <div>
              <div>{t.label}</div>
              {filter === t.v && <div className={`text-xs font-normal mt-0.5 ${filter === t.v ? 'text-white/75' : 'text-gray-400'}`}>{t.desc}</div>}
            </div>
            {counts[t.v] > 0 && (
              <span className={`ml-2 text-xs font-black px-2 py-0.5 rounded-full flex-shrink-0 ${filter === t.v ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-600'}`}>
                {counts[t.v]}
              </span>
            )}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <div className="text-3xl mb-2">{filter === 'pending' ? '🎉' : '📋'}</div>
          <p className="text-sm font-semibold">
            {filter === 'pending' ? 'No pending rejections — all clear!' : `No ${filter} rejections`}
          </p>
        </div>
      )}

      {visible.map(r => {
        const p = PURPOSE_LABEL[r.purpose || 'inbound']
        const isOutbound = r.purpose === 'outbound'
        const ts = (t) => t ? new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

        return (
          <div key={r.id} className={`bg-white rounded-2xl shadow p-4 space-y-3 border-l-4 ${
            r._tab === 'pending' ? 'border-rose-400' :
            r._tab === 'approved' ? 'border-red-600' :
            r._tab === 'resolved' ? 'border-green-400' : 'border-gray-300'
          }`}>
            {/* Header row */}
            <div className="flex items-start gap-2 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-gray-800 text-base">{r.vehicle_no}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.color}`}>{p.label}</span>
                  {r.dock_no && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold">🏭 {r.dock_no}</span>}
                </div>
                {r.shipment_no && <div className="text-xs text-gray-500 mt-0.5">📦 {r.shipment_no}</div>}
              </div>
            </div>

            {/* Reason box */}
            <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
              <div className="text-[10px] font-bold text-red-400 mb-0.5">REJECTION REASON</div>
              <div className="text-sm text-red-700 font-semibold">{r.reason}</div>
            </div>

            {/* Meta info */}
            <div className="text-xs text-gray-400 space-y-0.5">
              <div>👷 Raised by <span className="font-semibold text-gray-600">{r.supervisor_name || 'Supervisor'}</span> · {ts(r.created_at)}</div>
              {r.decided_by_name && (
                <div>👤 Decision by <span className="font-semibold text-gray-600">{r.decided_by_name}</span>{r.decided_at ? ` · ${ts(r.decided_at)}` : ''}</div>
              )}
              {r.resolved_at && (
                <div>✅ Resolved at {ts(r.resolved_at)}</div>
              )}
            </div>

            {r.photo && (
              <a href={`/uploads/${r.photo}`} target="_blank" rel="noreferrer"
                className="text-xs text-blue-500 underline font-semibold">📷 View Evidence Photo</a>
            )}

            {/* Actions */}
            {r._tab === 'pending' && (
              <div className="flex gap-2 pt-1">
                <button onClick={() => decide(r.id, 'deny')} disabled={loading}
                  className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-2.5 rounded-xl text-sm disabled:opacity-40 hover:bg-gray-50 transition">
                  ✗ Deny
                </button>
                <button onClick={() => decide(r.id, 'approve')} disabled={loading}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-sm disabled:opacity-40 transition">
                  ✓ Approve Rejection
                </button>
              </div>
            )}

            {r._tab === 'approved' && (
              <div className="space-y-2 pt-1">
                {isOutbound ? (
                  <>
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
                      📤 <strong>Outbound approved.</strong> Pick the right next step:
                      <ul className="mt-1.5 ml-4 list-disc space-y-0.5 text-xs">
                        <li><strong>Rectified</strong> — same vehicle fixed on-site (e.g. cleaned, driver passed retest) → returns to queue.</li>
                        <li><strong>Swap Vehicle No.</strong> — transporter sending a different vehicle against this shipment.</li>
                        <li><em>Or</em> leave it — if security re-enters this shipment at the gate with a new vehicle, it auto-swaps.</li>
                      </ul>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => resolve(r.id)} disabled={loading}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-40 transition">
                        ✅ Rectified — Return to Queue
                      </button>
                      <button onClick={() => setSwapRejection(r)} disabled={loading}
                        className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-40 transition">
                        🔄 Swap Vehicle No.
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">
                      📥 <strong>Inbound:</strong> Once the issue is rectified, click below to return the vehicle to queue.
                    </div>
                    <button onClick={() => resolve(r.id)} disabled={loading}
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-40 transition">
                      ✅ Issue Resolved — Return to Queue
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}

      {swapRejection && (
        <SwapVehicleModal
          rejection={swapRejection}
          onClose={() => setSwapRejection(null)}
          onDone={() => { setSwapRejection(null); load(); onRefresh() }}
        />
      )}
    </div>
  )
}

export default function OperationManagerDashboard() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState('overview')
  const [docks, setDocks] = useState([])
  const [queue, setQueue] = useState([])
  const [active, setActive] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [pendingRejCount, setPendingRejCount] = useState(0)
  const [selectedDock, setSelectedDock] = useState(null)
  const [overrideVehicle, setOverrideVehicle] = useState(null)
  const [journeyVehicle, setJourneyVehicle] = useState(null)
  const [statusFilter, setStatusFilter] = useState([])
  const [unassigning, setUnassigning] = useState(null)
  const [search, setSearch] = useState('')
  const [waVehicle, setWaVehicle] = useState(null)
  const [dockView, setDockView] = useState('card')
  const [vFrom, setVFrom] = useState(todayStr())
  const [vTo, setVTo]     = useState(todayStr())
  const [exporting, setExporting] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [d, q, v, rj] = await Promise.all([
        api.get('/docks'),
        api.get('/vehicles/queue'),
        api.get('/vehicles/active'),
        api.get('/rejections?status=pending'),
      ])
      setDocks(d.data); setQueue(q.data); setActive(v.data)
      setPendingRejCount(rj.data.length)
    } catch {}
  }, [])

  const fetchVehicles = useCallback(async () => {
    try {
      const [activeRes, histRes] = await Promise.all([
        api.get('/vehicles/active'),
        api.get(`/vehicles/history?from=${vFrom}&to=${vTo}`),
      ])
      const map = new Map()
      ;[...activeRes.data, ...histRes.data].forEach(v => map.set(v.id, v))
      const sorted = [...map.values()].sort((a, b) => new Date(b.arrival_time) - new Date(a.arrival_time))
      setVehicles(sorted)
    } catch {}
  }, [vFrom, vTo])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { if (tab === 'vehicles') fetchVehicles() }, [tab, fetchVehicles])
  useEffect(() => {
    socket.on('data_changed', () => { refresh(); if (tab === 'vehicles') fetchVehicles() })
    return () => socket.off('data_changed', refresh)
  }, [refresh, fetchVehicles, tab])

  const downloadExcel = async () => {
    setExporting(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/export/excel?from=${vFrom}&to=${vTo}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `vehicles_${vFrom}_to_${vTo}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { alert('Export failed') }
    finally { setExporting(false) }
  }

  const freeDocks  = docks.filter(d => d.status === 'green').length
  const assigned   = docks.filter(d => d.status === 'orange').length
  const unloading  = docks.filter(d => d.status === 'red').length

  const TABS = [
    { id: 'overview',   label: '📊 Overview' },
    { id: 'vehicles',   label: '🚛 Vehicles', badge: active.length },
    { id: 'queue',      label: '⏳ Queue', badge: queue.length },
    { id: 'rejections', label: '🚫 Rejections', badge: pendingRejCount },
    { id: 'docks',      label: '🏭 Docks' },
    { id: 'users',      label: '👥 Users' },
  ]

  const unassign = async (v) => {
    if (!window.confirm(`Move ${v.vehicle_no} back to the queue?`)) return
    setUnassigning(v.id)
    try {
      await api.post(`/vehicles/${v.id}/unassign`)
      refresh(); fetchVehicles()
    } catch (e) {
      alert(e.response?.data?.error || 'Could not unassign')
    } finally { setUnassigning(null) }
  }

  const STATUS_FILTER_OPTS = ['reported','waiting','assigned','unloading','offloaded','departed','rejection_pending','rejected_hold','rejected_departed']
  const toggleStatus = (s) => setStatusFilter(prev =>
    prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
  )
  const q = search.trim().toLowerCase()
  const filteredVehicles = vehicles.filter(v => {
    if (statusFilter.length > 0 && !statusFilter.includes(v.status)) return false
    if (!q) return true
    return (v.vehicle_no || '').toLowerCase().includes(q)
        || (v.shipment_no || '').toLowerCase().includes(q)
        || (v.driver_name || '').toLowerCase().includes(q)
        || (v.driver_mobile || '').includes(q)
        || (v.dock_no || '').toLowerCase().includes(q)
  })

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-indigo-700 text-white px-4 py-3 flex items-center justify-between shadow-md flex-shrink-0">
        <div>
          <h1 className="text-lg font-black">📊 Operations</h1>
          <p className="text-indigo-200 text-xs">{user.name}</p>
        </div>
        <button onClick={logout} className="bg-indigo-800 px-3 py-2 rounded-xl text-sm font-semibold">Logout</button>
      </header>

      {/* Stats bar */}
      <div className="bg-white px-4 py-2.5 grid grid-cols-4 gap-1 shadow text-center flex-shrink-0">
        <div><div className="text-xl font-black text-green-600">{freeDocks}</div><div className="text-xs text-gray-400">Free</div></div>
        <div><div className="text-xl font-black text-orange-500">{assigned}</div><div className="text-xs text-gray-400">Assigned</div></div>
        <div><div className="text-xl font-black text-red-500">{unloading}</div><div className="text-xs text-gray-400">In Progress</div></div>
        <div><div className="text-xl font-black text-amber-500">{queue.length}</div><div className="text-xs text-gray-400">Queue</div></div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b overflow-x-auto flex-shrink-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 px-2 py-3 text-xs font-bold whitespace-nowrap transition ${tab === t.id ? 'text-indigo-600' : 'text-gray-400'}`}
            style={tab === t.id ? { borderBottom: '3px solid #4338ca' } : {}}>
            {t.label}
            {t.badge > 0 && (
              <span className={`ml-1 text-white text-xs px-1.5 py-0.5 rounded-full ${t.id === 'rejections' ? 'bg-rose-500' : 'bg-red-500'}`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">

        {/* ── Overview ── */}
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl shadow p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-black text-gray-700">Dock Scorecards</h2>
                  <p className="text-xs text-gray-400">Tap to assign supervisor</p>
                </div>
                <div className="flex bg-gray-100 rounded-xl overflow-hidden">
                  <button onClick={() => setDockView('card')}
                    className={`px-3 py-1.5 text-xs font-bold transition ${dockView === 'card' ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}>
                    ⊞ Cards
                  </button>
                  <button onClick={() => setDockView('list')}
                    className={`px-3 py-1.5 text-xs font-bold transition ${dockView === 'list' ? 'bg-indigo-600 text-white' : 'text-gray-500'}`}>
                    ☰ List
                  </button>
                </div>
              </div>

              {docks.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">No docks configured</div>
              ) : dockView === 'card' ? (
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))' }}>
                  {docks.map(dock => (
                    <button key={dock.id} onClick={() => setSelectedDock(dock)}
                      className={`${DOCK_BG[dock.status]} rounded-xl p-2.5 text-left shadow active:scale-95 transition-transform ring-2 ${DOCK_RING[dock.status]}`}>
                      <div className="flex items-center justify-between">
                        <div className="text-white text-base font-black leading-tight truncate">{dock.dock_no}</div>
                        <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${(dock.type || 'inbound') === 'outbound' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                          {(dock.type || 'inbound') === 'outbound' ? 'OUT' : 'IN'}
                        </span>
                      </div>
                      <div className="text-white/80 text-[10px] font-bold mt-0.5 uppercase">{DOCK_LBL[dock.status]}</div>
                      <DockTimer dock={dock} />
                      {dock.vehicle_no && <div className="text-white text-[11px] font-bold mt-1 truncate">🚛 {dock.vehicle_no}</div>}
                      <div className="mt-1 pt-1 border-t border-white/20">
                        {dock.supervisor_name
                          ? <div className="text-white/90 text-[11px] truncate">👤 {dock.supervisor_name}</div>
                          : <div className="text-white/60 text-[11px]">No supervisor</div>}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {docks.map(dock => (
                    <button key={dock.id} onClick={() => setSelectedDock(dock)}
                      className="w-full flex items-center gap-3 bg-gray-50 hover:bg-gray-100 rounded-2xl px-4 py-3 text-left transition">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${DOCK_BG[dock.status]}`} />
                      <div className="font-black text-gray-800 w-14 flex-shrink-0">{dock.dock_no}</div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${(dock.type||'inbound')==='outbound'?'bg-amber-100 text-amber-700':'bg-sky-100 text-sky-700'}`}>
                        {(dock.type||'inbound')==='outbound'?'📤 OUT':'📥 IN'}
                      </span>
                      <div className="flex-1 min-w-0">
                        {dock.vehicle_no
                          ? <div className="text-sm font-bold text-gray-600 truncate">🚛 {dock.vehicle_no}</div>
                          : <div className="text-xs text-gray-400">{DOCK_LBL[dock.status]}</div>}
                        {dock.supervisor_name
                          ? <div className="text-xs text-gray-500">👤 {dock.supervisor_name}</div>
                          : <div className="text-xs text-amber-500">No supervisor</div>}
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <span className={`text-xs font-black px-2 py-1 rounded-full text-white ${DOCK_BG[dock.status]}`}>
                          {DOCK_LBL[dock.status]}
                        </span>
                        <DockTimer dock={dock} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {queue.length > 0 && (
              <div className="bg-white rounded-3xl shadow p-4">
                <h2 className="font-black text-gray-700 mb-3">Waiting Queue</h2>
                <WaitingQueue queue={queue} docks={docks} />
              </div>
            )}

            {pendingRejCount > 0 && (
              <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4 flex items-center gap-3"
                onClick={() => setTab('rejections')} role="button">
                <div className="text-3xl">🚫</div>
                <div className="flex-1">
                  <div className="font-black text-rose-700">{pendingRejCount} Rejection{pendingRejCount > 1 ? 's' : ''} Pending Approval</div>
                  <div className="text-xs text-rose-500 mt-0.5">Tap to review and approve or deny</div>
                </div>
                <div className="text-rose-400 font-bold text-xl">›</div>
              </div>
            )}

            <PerformancePanel />
          </div>
        )}

        {/* ── Vehicles ── */}
        {tab === 'vehicles' && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl shadow p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">From</label>
                  <input type="date" value={vFrom} onChange={e => setVFrom(e.target.value)}
                    className="w-full border-2 border-gray-200 rounded-2xl px-3 py-2.5 focus:border-indigo-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">To</label>
                  <input type="date" value={vTo} onChange={e => setVTo(e.target.value)}
                    className="w-full border-2 border-gray-200 rounded-2xl px-3 py-2.5 focus:border-indigo-500 outline-none text-sm" />
                </div>
              </div>
              <button onClick={downloadExcel} disabled={exporting}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-2xl disabled:opacity-40 transition flex items-center justify-center gap-2 text-sm">
                {exporting ? '⏳ Exporting...' : '📊 Export Excel'}
              </button>
            </div>

            <div className="bg-white rounded-2xl shadow p-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search vehicle, shipment, driver, dock…"
                  className="w-full border-2 border-gray-200 rounded-2xl pl-9 pr-9 py-2.5 text-sm focus:border-indigo-500 outline-none" />
                {search && (
                  <button onClick={() => setSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg">×</button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-500">FILTER BY STATUS</span>
                {statusFilter.length > 0 && (
                  <button onClick={() => setStatusFilter([])} className="text-xs text-indigo-600 font-bold">Clear</button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_FILTER_OPTS.map(s => {
                  const isActive = statusFilter.includes(s)
                  const meta = STATUS[s]
                  return (
                    <button key={s} onClick={() => toggleStatus(s)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-full transition ${
                        isActive ? `${meta.color} text-white` : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}>
                      {meta.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <p className="text-xs text-gray-400 font-semibold">
              {filteredVehicles.length} record{filteredVehicles.length !== 1 ? 's' : ''}
              {statusFilter.length > 0 && ` (filtered from ${vehicles.length})`}
            </p>

            {filteredVehicles.length === 0 && (
              <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-2">🚛</div><p>No vehicles match</p></div>
            )}

            {filteredVehicles.map(v => {
              const s = STATUS[v.status] || STATUS.reported
              const p = PURPOSE_LABEL[v.purpose || 'inbound']
              return (
                <div key={v.id} onClick={() => setJourneyVehicle(v)}
                  className={`bg-white rounded-2xl shadow p-4 border-l-4 ${s.border} cursor-pointer hover:shadow-md active:scale-[0.99] transition`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-black text-gray-800">{v.vehicle_no}</span>
                        <span className={`text-xs font-black px-2 py-0.5 rounded-full text-white ${s.color}`}>{s.label}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.color}`}>{p.short}</span>
                      </div>
                      {v.shipment_no && <div className="text-sm text-gray-500 mt-0.5">📦 {v.shipment_no}</div>}
                      {v.driver_name && <div className="text-xs text-gray-500 mt-0.5">👤 {v.driver_name}{v.driver_mobile ? ` · 📞 ${v.driver_mobile}` : ''}</div>}
                      <div className="text-xs text-gray-400 mt-1">
                        {new Date(v.arrival_time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {v.offload_time && ` · ${duration(v.arrival_time, v.offload_time)}`}
                      </div>
                      {v.dock_no && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold mt-1 inline-block">🏭 {v.dock_no}</span>}
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      {v.status === 'assigned' && v.driver_mobile && (
                        <button onClick={e => { e.stopPropagation(); setWaVehicle(v) }}
                          className="bg-green-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs text-center">
                          📲 Notify
                        </button>
                      )}
                      {v.status === 'assigned' && (
                        <button onClick={e => { e.stopPropagation(); setOverrideVehicle(v) }}
                          className="bg-orange-100 text-orange-700 font-bold px-3 py-1.5 rounded-xl text-xs">
                          🔀 Override
                        </button>
                      )}
                      {v.status === 'assigned' && (
                        <button onClick={e => { e.stopPropagation(); unassign(v) }}
                          disabled={unassigning === v.id}
                          className="bg-red-100 text-red-700 font-bold px-3 py-1.5 rounded-xl text-xs disabled:opacity-40">
                          {unassigning === v.id ? '…' : '↩️ Unassign'}
                        </button>
                      )}
                      {v.status === 'rejected_hold' && (
                        <button onClick={e => { e.stopPropagation(); setOverrideVehicle(v) }}
                          className="bg-rose-100 text-rose-700 font-bold px-3 py-1.5 rounded-xl text-xs">
                          🔀 Reassign
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'queue' && <WaitingQueue queue={queue} docks={docks} />}

        {tab === 'rejections' && <RejectionsPanel onRefresh={refresh} />}

        {tab === 'docks' && <DockMaster onRefresh={refresh} allowActivation={true} />}

        {tab === 'users' && <UserMaster allowedRoles={['security', 'dock_supervisor']} accent="indigo" />}

      </div>

      {selectedDock && (
        <DockSupervisorAssignModal
          dock={selectedDock}
          onClose={() => setSelectedDock(null)}
          onSaved={() => { refresh(); setSelectedDock(null) }}
        />
      )}

      {overrideVehicle && (
        <DockOverrideModal
          vehicle={overrideVehicle}
          docks={docks}
          onClose={() => setOverrideVehicle(null)}
          onSaved={() => { refresh(); setOverrideVehicle(null) }}
        />
      )}

      {journeyVehicle && (
        <VehicleJourneyModal
          vehicle={journeyVehicle}
          onClose={() => setJourneyVehicle(null)}
        />
      )}

      {waVehicle && (
        <WhatsAppLanguageModal
          vehicle={waVehicle}
          onClose={() => setWaVehicle(null)}
        />
      )}
    </div>
  )
}
