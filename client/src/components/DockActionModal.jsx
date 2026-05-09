import { useState } from 'react'
import api from '../api'

async function downloadDockOut(vehicleId, vehicleNo) {
  try {
    const res = await fetch(`/api/vehicles/${vehicleId}/dock-out.pdf`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
    if (!res.ok) { alert('Could not generate report'); return }
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${vehicleNo}-dock-completion.pdf`
    a.click()
    URL.revokeObjectURL(url)
  } catch { alert('Download failed') }
}

const STATUS_BG = { green: 'bg-green-500', orange: 'bg-orange-500', red: 'bg-red-500' }

function PhotoPicker({ label, required, preview, borderColor, onPick, onClear }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-600 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {preview ? (
        <div className="relative">
          <img src={preview} className="w-full h-40 object-cover rounded-2xl" alt="" />
          <button onClick={onClear} className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-8 h-8 font-bold text-lg">×</button>
        </div>
      ) : (
        <label className={`flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-2xl cursor-pointer transition ${borderColor} hover:opacity-80`}>
          <div className="text-3xl">📷</div>
          <div className="text-sm font-semibold text-gray-500 mt-1">Tap to capture</div>
          <input type="file" accept="image/*" capture="environment" onChange={onPick} className="hidden" />
        </label>
      )}
    </div>
  )
}

export default function DockActionModal({ dock, vehicle, onClose, onAction }) {
  const [sealPhoto,       setSealPhoto]       = useState(null)
  const [sealPreview,     setSealPreview]     = useState(null)
  const [gatePhoto,       setGatePhoto]       = useState(null)
  const [gatePreview,     setGatePreview]     = useState(null)
  const [offloadPhoto,    setOffloadPhoto]    = useState(null)
  const [offloadPreview,  setOffloadPreview]  = useState(null)
  const [closeSealPhoto,  setCloseSealPhoto]  = useState(null)
  const [closeSealPreview,setCloseSealPreview]= useState(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [completed,  setCompleted]  = useState(null)   // { id, vehicle_no } after offload success

  const isOutbound = (vehicle?.purpose || 'inbound') === 'outbound'

  const pick = (setFile, setPreview) => (e) => {
    const f = e.target.files[0]
    if (f) { setFile(f); setPreview(URL.createObjectURL(f)) }
  }
  const clear = (setFile, setPreview) => () => { setFile(null); setPreview(null) }

  const startUnloading = async () => {
    if (!sealPhoto) { setError(isOutbound ? 'Empty vehicle photo is required' : 'Seal photo is required'); return }
    if (!isOutbound && !gatePhoto) { setError('Gate opened photo is required'); return }
    setLoading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('seal_photo', sealPhoto)
      if (!isOutbound && gatePhoto) fd.append('gate_photo', gatePhoto)
      await api.post(`/vehicles/${vehicle.id}/start-unloading`, fd)
      onAction()
    } catch (e) {
      setError(e.response?.data?.error || 'Action failed')
      setLoading(false)
    }
  }

  const markOffloaded = async () => {
    if (isOutbound && !offloadPhoto)    { setError('Material stacking photo is required'); return }
    if (isOutbound && !closeSealPhoto)  { setError('Closing seal photo is required'); return }
    setLoading(true); setError('')
    try {
      const fd = new FormData()
      if (offloadPhoto)                 fd.append('photo', offloadPhoto)
      if (isOutbound && closeSealPhoto) fd.append('close_seal_photo', closeSealPhoto)
      await api.post(`/vehicles/${vehicle.id}/offloaded`, fd)
      // Show success screen instead of immediately closing — let supervisor download the report
      setCompleted({ id: vehicle.id, vehicle_no: vehicle.vehicle_no })
    } catch (e) {
      setError(e.response?.data?.error || 'Action failed')
      setLoading(false)
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (completed) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center">
        <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md shadow-2xl overflow-hidden">
          <div className="bg-green-600 px-5 py-5 text-center">
            <div className="text-5xl mb-1">✅</div>
            <div className="text-white text-xl font-black">
              {isOutbound ? 'Loading Complete!' : 'Offloading Complete!'}
            </div>
            <div className="text-green-100 text-sm mt-1">{completed.vehicle_no} · Dock freed</div>
          </div>
          <div className="p-5 space-y-3">
            <p className="text-sm text-gray-500 text-center">
              Download the dock completion report with full timestamps and evidence photos.
            </p>
            <button
              onClick={() => downloadDockOut(completed.id, completed.vehicle_no)}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-4 rounded-2xl text-base transition flex items-center justify-center gap-2"
            >
              📄 Download Dock Completion Report
            </button>
            <button
              onClick={onAction}
              className="w-full border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-2xl text-sm hover:bg-gray-50 transition"
            >
              ✓ Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto shadow-2xl">

        <div className={`${STATUS_BG[dock.status]} rounded-t-3xl px-5 py-4 flex items-center justify-between`}>
          <div>
            <div className="text-white text-4xl font-black">{dock.dock_no}</div>
            <div className="flex items-center gap-2 mt-0.5">
              {dock.supervisor_name && <div className="text-white/75 text-sm">{dock.supervisor_name}</div>}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isOutbound ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                {isOutbound ? '📤 OUT' : '📥 IN'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-4xl w-12 h-12 flex items-center justify-center">×</button>
        </div>

        <div className="p-5 space-y-4">

          {vehicle && (
            <div className="bg-gray-50 rounded-2xl p-4">
              <div className="text-2xl font-black text-gray-800">{vehicle.vehicle_no}</div>
              {vehicle.shipment_no && <div className="text-sm text-gray-500 mt-0.5">📦 {vehicle.shipment_no}</div>}
              {vehicle.driver_name && <div className="text-sm text-gray-500">👤 {vehicle.driver_name}{vehicle.driver_mobile ? ` · 📞 ${vehicle.driver_mobile}` : ''}</div>}
              <div className="flex gap-4 mt-1.5 text-xs text-gray-400">
                <span>In: {new Date(vehicle.arrival_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                {vehicle.assigned_time && <span>Assigned: {new Date(vehicle.assigned_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
              </div>
            </div>
          )}

          {dock.status === 'green' && (
            <div className="text-center py-8">
              <div className="text-5xl mb-2">✅</div>
              <div className="text-gray-600 font-semibold">Dock is empty and ready</div>
            </div>
          )}

          {/* ORANGE: open gate */}
          {dock.status === 'orange' && vehicle && (
            <div className="space-y-4">
              <h3 className="font-black text-gray-800 text-lg">
                {isOutbound ? 'Check Vehicle & Open Gate' : 'Check Seal & Open Gate'}
              </h3>

              {isOutbound ? (
                /* Outbound: only 1 photo — empty vehicle image */
                <PhotoPicker
                  label="Empty Vehicle Photo (before loading)"
                  required
                  preview={sealPreview}
                  borderColor="border-orange-300 bg-orange-50"
                  onPick={pick(setSealPhoto, setSealPreview)}
                  onClear={clear(setSealPhoto, setSealPreview)}
                />
              ) : (
                /* Inbound: seal + gate opened photos */
                <>
                  <PhotoPicker
                    label="1. Seal Photo (before opening)"
                    required
                    preview={sealPreview}
                    borderColor="border-orange-300 bg-orange-50"
                    onPick={pick(setSealPhoto, setSealPreview)}
                    onClear={clear(setSealPhoto, setSealPreview)}
                  />
                  <PhotoPicker
                    label="2. Gate Opened Photo"
                    required
                    preview={gatePreview}
                    borderColor="border-red-300 bg-red-50"
                    onPick={pick(setGatePhoto, setGatePreview)}
                    onClear={clear(setGatePhoto, setGatePreview)}
                  />
                </>
              )}

              {error && <p className="text-red-500 text-sm font-medium">{error}</p>}

              <button
                onClick={startUnloading}
                disabled={loading || !sealPhoto || (!isOutbound && !gatePhoto)}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-5 rounded-2xl text-xl disabled:opacity-40 transition"
              >
                {loading ? '⏳ Processing...' : isOutbound ? '🚪 Open Gate — Start Loading' : '🚪 Open Gate — Start Unloading'}
              </button>
            </div>
          )}

          {/* RED: complete */}
          {dock.status === 'red' && vehicle && (
            <div className="space-y-4">
              <h3 className="font-black text-gray-800 text-lg">
                {isOutbound ? 'Vehicle Loaded' : 'Vehicle Offloaded'}
              </h3>

              {isOutbound ? (
                <>
                  <PhotoPicker
                    label="1. Material Stacking Photo"
                    required
                    preview={offloadPreview}
                    borderColor="border-green-300 bg-green-50"
                    onPick={pick(setOffloadPhoto, setOffloadPreview)}
                    onClear={clear(setOffloadPhoto, setOffloadPreview)}
                  />
                  <PhotoPicker
                    label="2. Closing Seal Photo (applied on loaded trailer)"
                    required
                    preview={closeSealPreview}
                    borderColor="border-amber-300 bg-amber-50"
                    onPick={pick(setCloseSealPhoto, setCloseSealPreview)}
                    onClear={clear(setCloseSealPhoto, setCloseSealPreview)}
                  />
                </>
              ) : (
                <PhotoPicker
                  label="Offloaded Vehicle Photo (optional)"
                  preview={offloadPreview}
                  borderColor="border-green-300 bg-green-50"
                  onPick={pick(setOffloadPhoto, setOffloadPreview)}
                  onClear={clear(setOffloadPhoto, setOffloadPreview)}
                />
              )}

              {error && <p className="text-red-500 text-sm font-medium">{error}</p>}

              <button
                onClick={markOffloaded}
                disabled={loading || (isOutbound && (!offloadPhoto || !closeSealPhoto))}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-black py-5 rounded-2xl text-xl disabled:opacity-40 transition"
              >
                {loading ? '⏳ Processing...' : isOutbound ? '✅ Loaded — Free Dock' : '✅ Offloaded — Free Dock'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
