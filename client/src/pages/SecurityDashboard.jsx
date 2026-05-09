import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import socket from '../socket'
import VehicleEntry from '../components/VehicleEntry'
import { STATUS, PURPOSE_LABEL } from '../constants'

async function downloadExitReceipt(vehicleId, vehicleNo) {
  try {
    const res = await fetch(`/api/vehicles/${vehicleId}/exit-receipt.pdf`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
    if (!res.ok) { alert('Could not generate exit receipt'); return }
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${vehicleNo}-exit-receipt.pdf`
    a.click()
    URL.revokeObjectURL(url)
  } catch { alert('Download failed') }
}

// Full-screen confirmation shown to Security before marking a vehicle departed.
// The vehicle number is displayed huge so the guard can cross-check it against
// the physical number plate before tapping Confirm. Gate-pass photo is
// mandatory — the Confirm button is disabled until one is captured.
function DepartConfirmModal({ vehicle, loading, onCancel, onConfirm }) {
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState(null)

  const isRejected = vehicle.status === 'rejected_hold'
  const headerBg   = isRejected ? 'bg-red-700'  : 'bg-gray-800'
  const actionBg   = isRejected ? 'bg-red-700 hover:bg-red-800'
                                : 'bg-gray-800 hover:bg-gray-900'
  const title      = isRejected ? '🚫  REJECTED DEPART' : '🚪  CONFIRM DEPART'
  const warnText   = isRejected
    ? 'This vehicle was REJECTED. It will leave without offloading.'
    : 'Vehicle has been offloaded and is now leaving the premises.'

  const handlePick = (e) => {
    const f = e.target.files[0]
    if (f) { setPhoto(f); setPreview(URL.createObjectURL(f)) }
  }
  const handleClear = () => { setPhoto(null); setPreview(null) }

  const handleConfirm = () => {
    if (!photo) return
    onConfirm(photo)
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-0 sm:p-4"
         onClick={e => e.target === e.currentTarget && !loading && onCancel()}>
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[95vh] sm:max-w-2xl sm:rounded-3xl shadow-2xl overflow-y-auto flex flex-col">

        {/* Header */}
        <div className={`${headerBg} text-white px-6 py-5 flex-shrink-0`}>
          <div className="text-2xl font-black">{title}</div>
          <div className="text-white/80 text-sm mt-1">Verify the vehicle and capture the gate pass</div>
        </div>

        <div className="flex-1 p-5 sm:p-8 space-y-5">

          {/* Big vehicle number */}
          <div className="text-center">
            <div className="text-xs font-black text-gray-400 tracking-widest uppercase mb-2">Vehicle Number</div>
            <div className="text-5xl sm:text-7xl font-black text-gray-900 tracking-[0.15em] break-all leading-tight">
              {vehicle.vehicle_no}
            </div>
          </div>

          {/* Context info */}
          <div className="bg-gray-50 rounded-2xl px-5 py-3 space-y-1 text-center">
            {vehicle.gate_pass_no && (
              <div className="text-indigo-700 font-black text-lg tracking-wider">🎫 {vehicle.gate_pass_no}</div>
            )}
            {vehicle.shipment_no && (
              <div className="text-gray-600 text-sm">📦 <span className="font-bold">{vehicle.shipment_no}</span></div>
            )}
            {vehicle.driver_name && (
              <div className="text-gray-500 text-xs">
                👤 {vehicle.driver_name}
                {vehicle.driver_mobile ? <> · 📞 {vehicle.driver_mobile}</> : null}
              </div>
            )}
            {vehicle.dock_no && (
              <div className="text-gray-500 text-xs">🏭 {vehicle.dock_no}</div>
            )}
          </div>

          {/* Gate pass photo — required */}
          <div>
            <label className="block text-sm font-black text-gray-700 mb-2">
              📷 Gate Pass Photo <span className="text-red-500">*</span>
            </label>
            {preview ? (
              <div className="relative">
                <img src={preview} alt="gate pass" className="w-full h-56 object-cover rounded-2xl border-2 border-gray-200" />
                <button onClick={handleClear} disabled={loading}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-10 h-10 font-bold text-xl shadow-lg">×</button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-indigo-300 rounded-2xl cursor-pointer hover:bg-indigo-50 transition">
                <div className="text-5xl mb-1">📷</div>
                <div className="text-gray-600 font-bold text-sm">Tap to capture signed gate pass</div>
                <div className="text-gray-400 text-xs mt-1">(stamped/signed by driver + supervisor)</div>
                <input type="file" accept="image/*" capture="environment" onChange={handlePick} className="hidden" />
              </label>
            )}
          </div>

          <div className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
            isRejected ? 'bg-red-50 text-red-700 border-2 border-red-200'
                       : 'bg-amber-50 text-amber-700 border-2 border-amber-200'
          }`}>
            ⚠️ {warnText}<br />
            <span className="font-normal text-xs">This action cannot be undone.</span>
          </div>
        </div>

        {/* Actions */}
        <div className="p-5 sm:p-6 border-t-2 border-gray-100 flex-shrink-0 grid grid-cols-2 gap-3">
          <button onClick={onCancel} disabled={loading}
            className="border-2 border-gray-300 text-gray-700 font-black py-5 rounded-2xl text-lg disabled:opacity-40">
            ✗ Cancel
          </button>
          <button onClick={handleConfirm} disabled={loading || !photo}
            className={`${actionBg} text-white font-black py-5 rounded-2xl text-lg disabled:opacity-40 transition`}>
            {loading ? '⏳ Processing...' : '✓ Yes, Depart'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SecurityDashboard() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState('register')
  const [vehicles, setVehicles] = useState([])
  const [departLoading,  setDepartLoading]  = useState(null)
  const [departConfirm,  setDepartConfirm]  = useState(null)
  const [departedVehicle, setDepartedVehicle] = useState(null)  // { id, vehicle_no } after success

  const refresh = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const [activeRes, histRes] = await Promise.all([
        api.get('/vehicles/active'),
        api.get(`/vehicles/history?date=${today}`),
      ])
      const map = new Map()
      histRes.data.forEach(v => map.set(v.id, v))
      activeRes.data.forEach(v => {
        const arrivalDate = v.arrival_time?.slice(0, 10)
        if (arrivalDate === today || ['offloaded', 'rejected_hold'].includes(v.status)) map.set(v.id, v)
      })
      const sorted = [...map.values()].sort((a, b) => new Date(b.arrival_time) - new Date(a.arrival_time))
      // departed vehicles are hidden from the list but counted in total
      setVehicles(sorted)
    } catch {}
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    socket.on('data_changed', refresh)
    return () => socket.off('data_changed', refresh)
  }, [refresh])

  const confirmDepart = async (gatePassPhoto) => {
    if (!departConfirm || !gatePassPhoto) return
    const v = departConfirm
    setDepartLoading(v.id)
    try {
      const fd = new FormData()
      fd.append('gate_pass_photo', gatePassPhoto)
      await api.post(`/vehicles/${v.id}/depart`, fd)
      setDepartConfirm(null)
      setDepartedVehicle({ id: v.id, vehicle_no: v.vehicle_no })
      refresh()
    } catch (e) {
      alert(e.response?.data?.error || 'Failed')
    } finally { setDepartLoading(null) }
  }

  const DEPARTED_STATUSES = ['departed', 'rejected_departed']
  const activeVehicles    = vehicles.filter(v => !DEPARTED_STATUSES.includes(v.status))
  const offloadedCount    = vehicles.filter(v => v.status === 'offloaded').length
  const rejectedHoldCount = vehicles.filter(v => v.status === 'rejected_hold').length
  const pendingDepart     = offloadedCount + rejectedHoldCount

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-blue-700 text-white px-4 py-3 flex items-center justify-between shadow-md flex-shrink-0">
        <div>
          <h1 className="text-lg font-black">🚛 DMT · Gate Security</h1>
          <p className="text-blue-200 text-xs">{user.name}</p>
        </div>
        <button onClick={logout} className="bg-blue-800 px-3 py-2 rounded-xl text-sm font-semibold">Logout</button>
      </header>

      <div className="flex bg-white border-b flex-shrink-0">
        {[
          { id: 'register', label: '➕ Register' },
          { id: 'log', label: "📋 Today's Log", badge: activeVehicles.length },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-sm font-bold transition ${tab === t.id ? 'text-blue-600' : 'text-gray-400'}`}
            style={tab === t.id ? { borderBottom: '3px solid #2563eb' } : {}}>
            {t.label}
            {t.badge > 0 && <span className="ml-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{t.badge}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'register' && (
          <VehicleEntry onRegistered={() => { refresh(); setTab('log') }} />
        )}

        {tab === 'log' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white rounded-2xl shadow p-3 text-center">
                <div className="text-2xl font-black text-blue-600">{vehicles.length}</div>
                <div className="text-xs text-gray-400 mt-0.5">Total Today</div>
              </div>
              {/* vehicles.length keeps the full day count including departed */}
              <div className="bg-white rounded-2xl shadow p-3 text-center">
                <div className="text-2xl font-black text-amber-500">{pendingDepart}</div>
                <div className="text-xs text-gray-400 mt-0.5">Pending Depart</div>
              </div>
              <div className="bg-white rounded-2xl shadow p-3 text-center">
                <div className="text-2xl font-black text-red-700">{rejectedHoldCount}</div>
                <div className="text-xs text-gray-400 mt-0.5">Rejected Hold</div>
              </div>
            </div>

            {activeVehicles.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <div className="text-4xl mb-2">📋</div>
                <p>{vehicles.length > 0 ? 'All vehicles have departed' : 'No vehicles today'}</p>
              </div>
            )}

            {activeVehicles.map(v => {
              const s = STATUS[v.status] || STATUS.reported
              const p = PURPOSE_LABEL[v.purpose || 'inbound']
              const canDepart = v.status === 'offloaded' || v.status === 'rejected_hold'
              const departLabel = v.status === 'rejected_hold' ? '🚫 Rejected Depart' : '🚪 Departed'

              return (
                <div key={v.id} className={`bg-white rounded-2xl shadow p-4 border-l-4 ${s.border}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xl font-black text-gray-800">{v.vehicle_no}</span>
                        <span className={`text-xs font-black px-2 py-0.5 rounded-full text-white ${s.color}`}>{s.label}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.color}`}>{p.short}</span>
                      </div>
                      {v.shipment_no && <div className="text-sm text-gray-500 mt-0.5">📦 {v.shipment_no}</div>}
                      {v.prev_shipment_no && (
                        <div className="text-xs text-orange-500 mt-0.5">📦 Was: {v.prev_shipment_no}</div>
                      )}
                      {v.driver_name && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          👤 {v.driver_name}{v.driver_mobile ? ` · 📞 ${v.driver_mobile}` : ''}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 mt-1">
                        {v.dock_no && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold">🏭 {v.dock_no}</span>}
                        <span className="text-xs text-gray-400">
                          In: {new Date(v.arrival_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          {v.offload_time && ` · Out: ${new Date(v.offload_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
                        </span>
                      </div>
                    </div>
                    {canDepart && (
                      <button
                        onClick={() => setDepartConfirm(v)}
                        disabled={departLoading === v.id}
                        className={`flex-shrink-0 text-white font-bold px-3 py-2 rounded-xl text-sm disabled:opacity-40 ${
                          v.status === 'rejected_hold' ? 'bg-red-700 hover:bg-red-800' : 'bg-gray-700 hover:bg-gray-800'
                        }`}
                      >
                        {departLoading === v.id ? '⏳' : departLabel}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {departConfirm && (
        <DepartConfirmModal
          vehicle={departConfirm}
          loading={departLoading === departConfirm.id}
          onCancel={() => setDepartConfirm(null)}
          onConfirm={confirmDepart}
        />
      )}

      {/* Exit receipt success modal */}
      {departedVehicle && (
        <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="bg-teal-700 px-6 py-6 text-center">
              <div className="text-6xl mb-2">🚛</div>
              <div className="text-white text-2xl font-black">Vehicle Departed!</div>
              <div className="text-teal-200 text-sm mt-1 font-semibold tracking-wide">
                {departedVehicle.vehicle_no}
              </div>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-500 text-center leading-relaxed">
                Download the <strong>Exit Receipt</strong> to hand over to the transporter.
                It contains the full journey log, timestamps, and the signed gate pass photo.
              </p>
              <button
                onClick={() => downloadExitReceipt(departedVehicle.id, departedVehicle.vehicle_no)}
                className="w-full bg-teal-700 hover:bg-teal-800 text-white font-black py-4 rounded-2xl text-base transition flex items-center justify-center gap-2"
              >
                📄 Download Exit Receipt
              </button>
              <button
                onClick={() => setDepartedVehicle(null)}
                className="w-full border-2 border-gray-200 text-gray-500 font-bold py-3 rounded-2xl text-sm hover:bg-gray-50 transition"
              >
                ✓ Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
