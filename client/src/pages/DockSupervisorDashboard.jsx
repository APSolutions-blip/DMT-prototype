import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import socket from '../socket'
import DockActionModal from '../components/DockActionModal'
import VehicleCard from '../components/VehicleCard'
import WhatsAppLanguageModal from '../components/WhatsAppLanguageModal'
import { STATUS, PURPOSE_LABEL, elapsedTimer, duration } from '../constants'

const DOCK_STATUS_BG = { green: 'bg-green-500', orange: 'bg-orange-500', red: 'bg-red-500' }

// Live timer that re-renders every 60 seconds
function LiveTimer({ from, label }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(id)
  }, [])
  const t = elapsedTimer(from)
  if (!t) return null
  return (
    <div className="text-white/90 text-sm font-bold mt-1">
      ⏱ {label}: {t}
    </div>
  )
}

// Reject Vehicle Modal
function RejectModal({ vehicle, onClose, onRejected }) {
  const [reason, setReason] = useState('')
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handlePhoto = (e) => {
    const f = e.target.files[0]
    if (f) { setPhoto(f); setPreview(URL.createObjectURL(f)) }
  }

  const submit = async () => {
    if (!reason.trim()) { setError('Reason is required'); return }
    setLoading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('vehicle_id', vehicle.id)
      fd.append('reason', reason.trim())
      if (photo) fd.append('photo', photo)
      await api.post('/rejections', fd)
      onRejected()
    } catch (e) {
      setError(e.response?.data?.error || 'Rejection failed')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="bg-red-600 rounded-t-3xl px-5 py-4 flex items-center justify-between">
          <div>
            <div className="text-white font-black text-lg">Reject Vehicle</div>
            <div className="text-white/80 text-sm">{vehicle.vehicle_no}</div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-4xl w-12 h-12 flex items-center justify-center">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-sm text-amber-700">
            Rejection requires OM approval. Vehicle will be placed on hold and dock will be freed.
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1.5">Rejection Reason <span className="text-red-500">*</span></label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-sm focus:border-red-400 outline-none resize-none"
              placeholder="e.g. Damaged seal, wrong vehicle, quantity mismatch..."
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1.5">Photo Evidence (optional)</label>
            {preview ? (
              <div className="relative">
                <img src={preview} className="w-full h-40 object-cover rounded-2xl" alt="" />
                <button onClick={() => { setPhoto(null); setPreview(null) }}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-8 h-8 font-bold text-lg">×</button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-28 border-2 border-dashed border-red-200 rounded-2xl cursor-pointer hover:bg-red-50 transition">
                <div className="text-3xl">📷</div>
                <div className="text-sm font-semibold text-gray-500 mt-1">Tap to capture</div>
                <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} className="hidden" />
              </label>
            )}
          </div>

          {error && <p className="text-red-500 text-sm font-medium">{error}</p>}

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-2xl">Cancel</button>
            <button onClick={submit} disabled={loading || !reason.trim()}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-2xl disabled:opacity-40 transition">
              {loading ? '⏳ Submitting...' : '🚫 Raise Rejection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DockSupervisorDashboard() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState('dock')
  const [myDock, setMyDock] = useState(null)
  const [myVehicle, setMyVehicle] = useState(null)
  const [log24, setLog24] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [waOpen, setWaOpen] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [docksRes, activeRes] = await Promise.all([
        api.get('/docks'),
        api.get('/vehicles/active'),
      ])

      const docks = docksRes.data
      // Find dock where THIS user is the assigned supervisor — works even after OM reassignment
      // because the docks query JOINs users live from the DB, not from the stale JWT token
      const myD = docks.find(d => d.supervisor_id === user.id) || null
      setMyDock(myD)

      if (myD) {
        const veh = activeRes.data.find(v => v.assigned_dock_id === myD.id && ['assigned', 'unloading'].includes(v.status))
        setMyVehicle(veh || null)
        setLog24(activeRes.data.filter(v => v.assigned_dock_id === myD.id && v.status === 'offloaded'))
      } else {
        setMyVehicle(null)
        setLog24([])
      }
    } catch {}
    finally { setLoading(false) }
  }, [user.id])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    socket.on('data_changed', refresh)
    return () => socket.off('data_changed', refresh)
  }, [refresh])

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading...</div>

  if (!myDock) {
    return (
      <div className="min-h-screen bg-gray-100 flex flex-col">
        <Header user={user} logout={logout} />
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center bg-white rounded-3xl shadow p-8">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-black text-gray-700">No Dock Assigned</h2>
            <p className="text-gray-500 mt-2">Ask your admin to assign a dock to your account.</p>
          </div>
        </div>
      </div>
    )
  }

  const dockColor = DOCK_STATUS_BG[myDock.status]
  const isOutbound = (myDock.type || 'inbound') === 'outbound'
  const stageLabel = myDock.status === 'green' ? 'Dock is empty and ready'
    : myDock.status === 'orange' ? `Vehicle assigned — awaiting gate open`
    : isOutbound ? 'Loading in progress' : 'Unloading in progress'

  // Timer anchor: orange → vehicle.assigned_time; red → vehicle.gate_open_time
  const timerTs = myDock.status === 'orange' ? myVehicle?.assigned_time
    : myDock.status === 'red' ? myVehicle?.gate_open_time
    : null
  const timerLabel = myDock.status === 'orange' ? 'Assigned' : isOutbound ? 'Loading' : 'Unloading'

  const canReject = myVehicle && ['assigned', 'unloading'].includes(myVehicle.status)

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Header user={user} logout={logout} />

      {/* My Dock Card */}
      <div className={`${dockColor} px-4 py-4 text-white shadow-lg flex-shrink-0`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="text-4xl font-black">{myDock.dock_no}</div>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${isOutbound ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                {isOutbound ? '📤 Outbound' : '📥 Inbound'}
              </span>
            </div>
            <div className="text-white/80 text-sm mt-0.5">{stageLabel}</div>
            {timerTs && <LiveTimer from={timerTs} label={timerLabel} />}
          </div>
          <div className="flex flex-col gap-2 items-end">
            {(myDock.status === 'orange' || myDock.status === 'red') && myVehicle && (
              <button
                onClick={() => setShowModal(true)}
                className="bg-white/20 hover:bg-white/30 text-white font-bold px-4 py-2.5 rounded-2xl text-sm transition"
              >
                {myDock.status === 'orange' ? '🚪 Open Gate' : '✅ Complete'}
              </button>
            )}
            {canReject && (
              <button
                onClick={() => setShowRejectModal(true)}
                className="bg-red-800/60 hover:bg-red-800/80 text-white font-bold px-4 py-2.5 rounded-2xl text-sm transition"
              >
                🚫 Reject Vehicle
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-white border-b flex-shrink-0">
        {[
          { id: 'dock', label: '🏭 My Dock' },
          { id: 'log',  label: '📋 Pending Departure', badge: log24.length },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-3 text-sm font-bold transition ${tab===t.id ? 'text-blue-600' : 'text-gray-400'}`}
            style={tab===t.id ? { borderBottom: '3px solid #2563eb' } : {}}>
            {t.label}
            {t.badge > 0 && <span className="ml-1 bg-gray-400 text-white text-xs px-1.5 py-0.5 rounded-full">{t.badge}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'dock' && (
          <div className="space-y-4">
            {myVehicle ? (
              <div className="bg-white rounded-3xl shadow p-5 space-y-3">
                <h3 className="font-black text-gray-700 text-lg">Vehicle at Dock</h3>
                <VehicleCard vehicle={myVehicle} />

                {myVehicle.driver_mobile && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-400">Driver / Transporter</div>
                      <div className="font-bold text-gray-800 text-sm truncate">{myVehicle.driver_name} · {myVehicle.driver_mobile}</div>
                    </div>
                    <a href={`tel:${myVehicle.driver_mobile}`} className="bg-blue-600 text-white px-3 py-2 rounded-xl text-sm font-bold">📞</a>
                    <a href={`sms:${myVehicle.driver_mobile}`} className="bg-gray-500 text-white px-3 py-2 rounded-xl text-sm font-bold">💬</a>
                    <button onClick={() => setWaOpen(true)}
                      className="bg-green-500 text-white px-3 py-2 rounded-xl text-sm font-bold">📲</button>
                  </div>
                )}

                {myDock.status === 'orange' && (
                  <div className="space-y-2">
                    <button onClick={() => setShowModal(true)}
                      className="w-full bg-red-600 text-white font-black py-5 rounded-2xl text-xl">
                      🔍 {isOutbound ? 'Check Vehicle & Open Gate' : 'Check Seal & Open Gate'}
                    </button>
                    <button onClick={() => setShowRejectModal(true)}
                      className="w-full bg-gray-100 text-red-600 font-bold py-3 rounded-2xl text-base border-2 border-red-200">
                      🚫 Reject Vehicle — Raise Issue
                    </button>
                  </div>
                )}
                {myDock.status === 'red' && (
                  <div className="space-y-2">
                    <button onClick={() => setShowModal(true)}
                      className="w-full bg-green-600 text-white font-black py-5 rounded-2xl text-xl">
                      ✅ {isOutbound ? 'Vehicle Loaded — Close Dock' : 'Vehicle Offloaded — Close Dock'}
                    </button>
                    <button onClick={() => setShowRejectModal(true)}
                      className="w-full bg-gray-100 text-red-600 font-bold py-3 rounded-2xl text-base border-2 border-red-200">
                      🚫 Reject Vehicle — Raise Issue
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-3xl shadow p-8 text-center">
                <div className="text-5xl mb-3">✅</div>
                <h3 className="font-black text-gray-700 text-lg">Dock is Empty</h3>
                <p className="text-gray-500 text-sm mt-1">Waiting for vehicle assignment</p>
              </div>
            )}
          </div>
        )}

        {tab === 'log' && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 font-semibold mb-3">Completed at this dock — waiting for departure</p>
            {log24.length === 0 && (
              <div className="text-center py-12 text-gray-400"><div className="text-4xl mb-2">✅</div><p>No vehicles pending departure</p></div>
            )}
            {log24.map(v => (
              <div key={v.id} className="bg-white rounded-2xl shadow p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="font-black text-gray-800">{v.vehicle_no}</div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${PURPOSE_LABEL[v.purpose || 'inbound'].color}`}>
                        {PURPOSE_LABEL[v.purpose || 'inbound'].short}
                      </span>
                    </div>
                    {v.shipment_no && <div className="text-sm text-gray-500">📦 {v.shipment_no}</div>}
                    <div className="text-xs text-gray-400 mt-1">
                      In: {new Date(v.arrival_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      {v.offload_time && ` · Out: ${new Date(v.offload_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
                      {v.offload_time && ` · ${duration(v.arrival_time, v.offload_time)}`}
                    </div>
                  </div>
                  <span className={`text-xs font-black px-2 py-1 rounded-full text-white flex-shrink-0 ${STATUS[v.status]?.color || 'bg-gray-400'}`}>
                    {STATUS[v.status]?.label || v.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && myDock && myVehicle && (
        <DockActionModal
          dock={myDock}
          vehicle={myVehicle}
          onClose={() => setShowModal(false)}
          onAction={() => { refresh(); setShowModal(false) }}
        />
      )}

      {showRejectModal && myVehicle && (
        <RejectModal
          vehicle={myVehicle}
          onClose={() => setShowRejectModal(false)}
          onRejected={() => { refresh(); setShowRejectModal(false) }}
        />
      )}

      {waOpen && myVehicle && myDock && (
        <WhatsAppLanguageModal
          vehicle={{ ...myVehicle, dock_no: myDock.dock_no }}
          onClose={() => setWaOpen(false)}
        />
      )}
    </div>
  )
}

function Header({ user, logout }) {
  return (
    <header className="bg-teal-700 text-white px-4 py-3 flex items-center justify-between shadow-md flex-shrink-0">
      <div>
        <h1 className="text-lg font-black">🏭 Dock Supervisor</h1>
        <p className="text-teal-200 text-xs">{user.name}</p>
      </div>
      <button onClick={logout} className="bg-teal-800 px-3 py-2 rounded-xl text-sm font-semibold">Logout</button>
    </header>
  )
}
