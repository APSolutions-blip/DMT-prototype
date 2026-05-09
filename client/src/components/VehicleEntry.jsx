import { useState, useRef, useEffect } from 'react'
import api from '../api'
import QrScanner from './QrScanner'
import { STATUS, PURPOSE_LABEL } from '../constants'

// ── Step 1: Shipment lookup ──────────────────────────────────────────────────
function ShipmentStep({ onResult }) {
  const [shipment, setShipment] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const lookup = async (sno) => {
    const val = (sno || shipment).trim()
    if (!val) { setError('Enter a shipment number'); return }
    setLoading(true); setError('')
    try {
      const { data } = await api.get(`/vehicles/lookup?shipment_no=${encodeURIComponent(val)}`)
      onResult(val, data)
    } catch (e) {
      setError(e.response?.data?.error || 'Lookup failed')
    } finally { setLoading(false) }
  }

  return (
    <>
      {showScanner && (
        <QrScanner
          onScan={(val) => { setShipment(val); setShowScanner(false); lookup(val) }}
          onClose={() => setShowScanner(false)}
        />
      )}
      <div className="bg-white rounded-3xl shadow p-5 space-y-4">
        <h2 className="text-xl font-black text-gray-800">Gate Entry</h2>
        <p className="text-sm text-gray-500 -mt-2">Scan or enter the shipment number first</p>

        <div>
          <label className="block text-sm font-semibold text-gray-500 mb-1.5">
            Shipment No. <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={shipment}
              onChange={e => { setShipment(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && lookup()}
              className="flex-1 border-2 border-gray-200 rounded-2xl px-4 py-3 text-lg focus:border-blue-500 outline-none"
              placeholder="Enter or scan shipment no."
              autoFocus
            />
            <button type="button" onClick={() => setShowScanner(true)}
              className="bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold px-4 py-3 rounded-2xl flex items-center gap-1.5 flex-shrink-0 transition">
              📷 Scan
            </button>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-2xl text-sm font-medium">❌ {error}</div>}

        <button onClick={() => lookup()} disabled={loading || !shipment.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl text-lg disabled:opacity-40 transition">
          {loading ? '⏳ Looking up...' : '🔍 Check Shipment'}
        </button>
      </div>
    </>
  )
}

// ── Shipment already exists — show status card ───────────────────────────────
function ShipmentExistsCard({ shipmentNo, lookup, onBack }) {
  const s = STATUS[lookup.status] || STATUS.reported
  const p = PURPOSE_LABEL[lookup.purpose || 'inbound']
  return (
    <div className="bg-white rounded-3xl shadow p-5 space-y-4">
      <h2 className="text-xl font-black text-red-600">⛔ Invalid — Already Registered</h2>
      <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-4 space-y-1.5">
        <div className="text-xs font-bold text-red-400 uppercase">Shipment</div>
        <div className="font-black text-gray-800 text-lg">{shipmentNo}</div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="font-black text-gray-700">{lookup.vehicle_no}</span>
          <span className={`text-xs font-black px-2 py-0.5 rounded-full text-white ${s.color}`}>{s.label}</span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${p.color}`}>{p.label}</span>
        </div>
        {lookup.driver_name && <div className="text-sm text-gray-500">👤 {lookup.driver_name}</div>}
        {lookup.dock_no && <div className="text-sm text-gray-500">🏭 {lookup.dock_no}</div>}
        <div className="text-xs text-gray-400">{lookup.arrival_time ? new Date(lookup.arrival_time).toLocaleString('en-IN') : ''}</div>
      </div>
      <button onClick={onBack}
        className="w-full border-2 border-gray-200 text-gray-600 font-bold py-3 rounded-2xl">
        ← Try Different Shipment
      </button>
    </div>
  )
}

// ── Outbound rejected — swap vehicle form ────────────────────────────────────
function OutboundSwapForm({ shipmentNo, existing, onRegistered }) {
  const [form, setForm] = useState({
    vehicle_no: '',
    driver_name: '',
    driver_mobile: '',
  })
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.vehicle_no.trim()) { setError('New vehicle number required'); return }
    if (!form.driver_name.trim()) { setError('Driver name required'); return }
    if (!form.driver_mobile.trim()) { setError('Driver mobile required'); return }
    if (!/^\d{10}$/.test(form.driver_mobile.trim())) { setError('Mobile must be 10 digits'); return }
    if (!photo) { setError('Vehicle photo required'); return }

    setLoading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('vehicle_no', form.vehicle_no.trim().toUpperCase())
      fd.append('shipment_no', shipmentNo)
      fd.append('driver_name', form.driver_name.trim())
      fd.append('driver_mobile', form.driver_mobile.trim())
      fd.append('purpose', 'outbound')
      fd.append('photo', photo)
      const { data } = await api.post('/vehicles/register', fd)
      onRegistered(data)
    } catch (e) {
      setError(e.response?.data?.error || 'Registration failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="bg-white rounded-3xl shadow p-5 space-y-4">
      <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4">
        <div className="font-black text-amber-700">🔄 Outbound Replacement Vehicle</div>
        <div className="text-sm text-amber-600 mt-0.5">
          Shipment <span className="font-bold">{shipmentNo}</span> — rejected vehicle <span className="font-bold">{existing.vehicle_no}</span>. Enter new vehicle details.
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-500 mb-1.5">New Vehicle No. <span className="text-red-500">*</span></label>
          <input type="text" value={form.vehicle_no}
            onChange={e => setForm(f => ({ ...f, vehicle_no: e.target.value.toUpperCase() }))}
            className="w-full border-2 border-gray-200 rounded-2xl px-4 py-4 text-2xl font-black text-center uppercase tracking-widest focus:border-amber-500 outline-none"
            placeholder="MH 01 AB 5678" autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">Driver Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.driver_name} onChange={set('driver_name')}
              className="w-full border-2 border-gray-200 rounded-2xl px-3 py-3 focus:border-amber-500 outline-none"
              placeholder="Full name" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">Mobile <span className="text-red-500">*</span></label>
            <input type="tel" value={form.driver_mobile} onChange={set('driver_mobile')}
              className="w-full border-2 border-gray-200 rounded-2xl px-3 py-3 focus:border-amber-500 outline-none"
              placeholder="10-digit" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-500 mb-1.5">Vehicle Photo <span className="text-red-500">*</span></label>
          {preview ? (
            <div className="relative">
              <img src={preview} className="w-full h-44 object-cover rounded-2xl border-2 border-gray-100" alt="plate" />
              <button type="button" onClick={() => { setPhoto(null); setPreview(null) }}
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-9 h-9 text-xl font-bold shadow">×</button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-amber-300 rounded-2xl cursor-pointer hover:bg-amber-50 transition">
              <div className="text-4xl mb-1">📷</div>
              <div className="text-gray-500 font-semibold text-sm">Capture vehicle photo</div>
              <input type="file" accept="image/*" capture="environment"
                onChange={e => { const f = e.target.files[0]; if (f) { setPhoto(f); setPreview(URL.createObjectURL(f)) } }}
                className="hidden" />
            </label>
          )}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-2xl text-sm font-medium">❌ {error}</div>}

        <button type="submit" disabled={loading || !form.vehicle_no.trim() || !photo}
          className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-5 rounded-2xl text-xl disabled:opacity-40 transition">
          {loading ? '⏳ Registering...' : '🔄 Register Replacement Vehicle'}
        </button>
      </form>
    </div>
  )
}

// ── Full registration form (new shipment) ────────────────────────────────────
function RegistrationForm({ shipmentNo, onRegistered }) {
  const [purpose, setPurpose] = useState('inbound')
  const [form, setForm] = useState({ vehicle_no: '', driver_name: '', driver_mobile: '' })
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.vehicle_no.trim())   { setError('Vehicle number is required'); return }
    if (!form.driver_name.trim())  { setError('Driver name is required'); return }
    if (!form.driver_mobile.trim()) { setError('Driver mobile is required'); return }
    if (!/^\d{10}$/.test(form.driver_mobile.trim())) { setError('Mobile must be exactly 10 digits'); return }
    if (!photo) { setError('Number plate photo is required'); return }

    setLoading(true); setError('')
    try {
      const fd = new FormData()
      fd.append('vehicle_no', form.vehicle_no.trim().toUpperCase())
      fd.append('shipment_no', shipmentNo)
      fd.append('driver_name', form.driver_name.trim())
      fd.append('driver_mobile', form.driver_mobile.trim())
      fd.append('purpose', purpose)
      fd.append('photo', photo)
      const { data } = await api.post('/vehicles/register', fd)
      onRegistered(data)
    } catch (e) {
      setError(e.response?.data?.error || 'Registration failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="bg-white rounded-3xl shadow p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div>
          <h2 className="text-xl font-black text-gray-800">New Entry</h2>
          <div className="text-sm text-gray-500">📦 {shipmentNo}</div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Purpose */}
        <div>
          <label className="block text-sm font-semibold text-gray-500 mb-1.5">Vehicle Purpose <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: 'inbound',  icon: '📥', label: 'Unloading', sub: 'Inbound' },
              { v: 'outbound', icon: '📤', label: 'Loading',   sub: 'Outbound' },
            ].map(o => (
              <button key={o.v} type="button" onClick={() => setPurpose(o.v)}
                className={`py-3.5 rounded-2xl font-black text-base border-2 transition ${
                  purpose === o.v
                    ? o.v === 'outbound' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-sky-600 bg-sky-50 text-sky-700'
                    : 'border-gray-200 text-gray-400'
                }`}>
                {o.icon} {o.label}<br /><span className="text-xs font-semibold opacity-70">{o.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Vehicle no */}
        <div>
          <label className="block text-sm font-semibold text-gray-500 mb-1.5">Vehicle Number <span className="text-red-500">*</span></label>
          <input type="text" value={form.vehicle_no}
            onChange={e => setForm(f => ({ ...f, vehicle_no: e.target.value.toUpperCase() }))}
            className="w-full border-2 border-gray-200 rounded-2xl px-4 py-4 text-2xl font-black text-center uppercase tracking-widest focus:border-blue-500 outline-none"
            placeholder="MH 01 AB 1234" autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">Driver Name <span className="text-red-500">*</span></label>
            <input type="text" value={form.driver_name} onChange={set('driver_name')}
              className="w-full border-2 border-gray-200 rounded-2xl px-3 py-3 focus:border-blue-500 outline-none"
              placeholder="Full name" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-500 mb-1.5">Driver Mobile <span className="text-red-500">*</span></label>
            <input type="tel" value={form.driver_mobile} onChange={set('driver_mobile')}
              className="w-full border-2 border-gray-200 rounded-2xl px-3 py-3 focus:border-blue-500 outline-none"
              placeholder="10-digit no." />
          </div>
        </div>

        {/* Photo */}
        <div>
          <label className="block text-sm font-semibold text-gray-500 mb-1.5">Number Plate Photo <span className="text-red-500">*</span></label>
          {preview ? (
            <div className="relative">
              <img src={preview} className="w-full h-44 object-cover rounded-2xl border-2 border-gray-100" alt="plate" />
              <button type="button" onClick={() => { setPhoto(null); setPreview(null) }}
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-9 h-9 text-xl font-bold shadow">×</button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-red-300 rounded-2xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
              <div className="text-4xl mb-1">📷</div>
              <div className="text-gray-500 font-semibold text-sm">Tap to capture plate photo</div>
              <input type="file" accept="image/*" capture="environment"
                onChange={e => { const f = e.target.files[0]; if (f) { setPhoto(f); setPreview(URL.createObjectURL(f)) } }}
                className="hidden" />
            </label>
          )}
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-2xl text-sm font-medium">❌ {error}</div>}

        <button type="submit" disabled={loading || !form.vehicle_no.trim() || !photo}
          className={`w-full text-white font-bold py-5 rounded-2xl text-xl disabled:opacity-40 transition ${
            purpose === 'outbound' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'
          }`}>
          {loading ? '⏳ Registering...' : `✅ Register ${purpose === 'outbound' ? 'Loading' : 'Unloading'} Vehicle`}
        </button>
      </form>
    </div>
  )
}

// ── Success screen ───────────────────────────────────────────────────────────
function SuccessScreen({ result, onReset }) {
  const { vehicle, assignedDock, swappedFrom } = result
  const purposeLabel = vehicle.purpose === 'outbound' ? 'Loading' : 'Unloading'

  const downloadGatePass = async (openInNewTab = false) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/vehicles/${vehicle.id}/gate-pass.pdf`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      if (openInNewTab) {
        window.open(url, '_blank')
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = `${vehicle.gate_pass_no || 'gate-pass'}.pdf`
        a.click()
      }
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch { alert('Could not download gate pass') }
  }

  // Auto-download once on mount so the guard always has the file ready.
  useEffect(() => {
    if (vehicle?.gate_pass_no) downloadGatePass(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="bg-white rounded-3xl shadow p-6 text-center space-y-4">
      <div className="text-6xl">✅</div>
      <h2 className="text-2xl font-black text-gray-800">Registered!</h2>
      <div className="bg-gray-50 rounded-2xl p-4 text-left space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="text-2xl font-black text-blue-700 tracking-widest">{vehicle.vehicle_no}</div>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${vehicle.purpose === 'outbound' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
            {purposeLabel}
          </span>
        </div>
        {vehicle.shipment_no && <div className="text-sm text-gray-600">📦 {vehicle.shipment_no}</div>}
        {vehicle.driver_name && <div className="text-sm text-gray-600">👤 {vehicle.driver_name}{vehicle.driver_mobile ? ` · 📞 ${vehicle.driver_mobile}` : ''}</div>}
        <div className="text-xs text-gray-400">{new Date(vehicle.arrival_time).toLocaleString('en-IN')}</div>
      </div>

      {vehicle.gate_pass_no && (
        <div className="bg-indigo-50 border-2 border-indigo-300 rounded-2xl p-4 space-y-2">
          <div className="text-xs font-bold text-indigo-500 uppercase">Gate Pass</div>
          <div className="text-3xl font-black text-indigo-700 tracking-widest">{vehicle.gate_pass_no}</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => downloadGatePass(false)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-sm transition">
              ⬇️ Download PDF
            </button>
            <button onClick={() => downloadGatePass(true)}
              className="bg-white hover:bg-indigo-50 text-indigo-700 border-2 border-indigo-300 font-bold py-2.5 rounded-xl text-sm transition">
              🖨️ Open & Print
            </button>
          </div>
          <div className="text-[11px] text-indigo-400">Hand this to the driver. Security will capture it at exit.</div>
        </div>
      )}

      {swappedFrom && (
        <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-3 text-left text-sm">
          <div className="font-bold text-orange-700">🔄 Vehicle Swapped</div>
          <div className="text-orange-600 text-xs mt-0.5">
            Old vehicle <span className="font-bold">{swappedFrom.vehicle_no}</span> must depart as Rejected.
          </div>
        </div>
      )}

      {assignedDock ? (
        <div className="bg-orange-50 border-2 border-orange-300 rounded-2xl p-4">
          <div className="text-orange-500 font-bold text-sm uppercase">Dock Assigned</div>
          <div className="text-5xl font-black text-orange-600 mt-1">{assignedDock.dock_no}</div>
        </div>
      ) : (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4">
          <div className="text-amber-600 font-bold text-lg">⏳ Added to waiting queue</div>
          <div className="text-gray-500 text-sm mt-1">Will be assigned when a {purposeLabel} dock is free</div>
        </div>
      )}

      <button onClick={onReset} className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl text-lg">
        ➕ Register Another Vehicle
      </button>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function VehicleEntry({ onRegistered }) {
  // step: 'shipment' | 'invalid' | 'swap' | 'register' | 'done'
  const [step, setStep] = useState('shipment')
  const [shipmentNo, setShipmentNo] = useState('')
  const [lookupResult, setLookupResult] = useState(null)
  const [successResult, setSuccessResult] = useState(null)

  const handleLookup = (sno, result) => {
    setShipmentNo(sno)
    setLookupResult(result)
    if (!result.found) {
      setStep('register')
    } else if (result.status === 'rejected_hold' && result.purpose === 'outbound') {
      setStep('swap')
    } else {
      setStep('invalid')
    }
  }

  const handleSuccess = (data) => {
    setSuccessResult(data)
    setStep('done')
  }

  const reset = () => {
    setStep('shipment')
    setShipmentNo('')
    setLookupResult(null)
    setSuccessResult(null)
    onRegistered()
  }

  if (step === 'done' && successResult) {
    return <SuccessScreen result={successResult} onReset={reset} />
  }

  if (step === 'invalid') {
    return <ShipmentExistsCard shipmentNo={shipmentNo} lookup={lookupResult} onBack={() => setStep('shipment')} />
  }

  if (step === 'swap') {
    return <OutboundSwapForm shipmentNo={shipmentNo} existing={lookupResult} onRegistered={handleSuccess} />
  }

  if (step === 'register') {
    return (
      <div className="space-y-3">
        <button onClick={() => setStep('shipment')}
          className="text-sm text-blue-600 font-bold flex items-center gap-1">
          ← Change Shipment No.
        </button>
        <RegistrationForm shipmentNo={shipmentNo} onRegistered={handleSuccess} />
      </div>
    )
  }

  return <ShipmentStep onResult={handleLookup} />
}
