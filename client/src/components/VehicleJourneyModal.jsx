import { useState } from 'react'
import { STATUS, duration } from '../constants'

const STAGES = [
  { key: 'reported',  label: 'Reported',     icon: '📝', timeField: 'arrival_time',  photoField: 'arrival_photo' },
  { key: 'assigned',  label: 'Dock Assigned',icon: '🏭', timeField: 'assigned_time', photoField: null },
  { key: 'unloading', label: 'Unloading',    icon: '📦', timeField: 'assigned_time', photoField: 'seal_photo', photoField2: 'gate_photo' },
  { key: 'offloaded', label: 'Offloaded',    icon: '✅', timeField: 'offload_time',  photoField: 'offload_photo', photoField2: 'close_seal_photo' },
  { key: 'departed',  label: 'Departed',     icon: '🚛', timeField: 'departed_time', photoField: 'gate_pass_photo' },
]

const ORDER = ['reported', 'waiting', 'assigned', 'unloading', 'offloaded', 'departed']

function fmt(ts) {
  if (!ts) return null
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function VehicleJourneyModal({ vehicle, onClose }) {
  const [zoomPhoto, setZoomPhoto] = useState(null)
  if (!vehicle) return null

  const currentIdx = ORDER.indexOf(vehicle.status)
  const s = STATUS[vehicle.status] || STATUS.reported

  const stageReached = (stageKey) => {
    const stageIdx = ORDER.indexOf(stageKey)
    return stageIdx <= currentIdx
  }

  const photoSrc = (name) => name ? `/uploads/${name}` : null

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[94vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className={`${s.color} px-5 py-4 flex items-center justify-between sticky top-0 z-10`}>
          <div>
            <div className="text-white text-2xl font-black">{vehicle.vehicle_no}</div>
            <div className="text-white/80 text-xs font-semibold">{s.label}</div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white text-4xl w-12 h-12 flex items-center justify-center">×</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Basic info */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-1.5 text-sm">
            {vehicle.shipment_no && <div><span className="text-gray-400">📦 Shipment</span><span className="ml-2 font-bold text-gray-800">{vehicle.shipment_no}</span></div>}
            {vehicle.driver_name && <div><span className="text-gray-400">👤 Driver</span><span className="ml-2 font-bold text-gray-800">{vehicle.driver_name}</span></div>}
            {vehicle.driver_mobile && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">📞 Mobile</span>
                <span className="font-bold text-gray-800">{vehicle.driver_mobile}</span>
                <a href={`tel:${vehicle.driver_mobile}`} className="ml-auto bg-blue-600 text-white px-2.5 py-1 rounded-lg text-xs font-bold">Call</a>
                <a href={`sms:${vehicle.driver_mobile}`} className="bg-gray-500 text-white px-2.5 py-1 rounded-lg text-xs font-bold">SMS</a>
              </div>
            )}
            {vehicle.dock_no && <div><span className="text-gray-400">🏭 Dock</span><span className="ml-2 font-bold text-gray-800">{vehicle.dock_no}</span></div>}
            {vehicle.gate_pass_no && <div><span className="text-gray-400">🎫 Gate Pass</span><span className="ml-2 font-bold text-indigo-700 tracking-wider">{vehicle.gate_pass_no}</span></div>}
            {vehicle.registered_by_name && <div><span className="text-gray-400">🔒 Registered by</span><span className="ml-2 font-bold text-gray-800">{vehicle.registered_by_name}</span></div>}
          </div>

          {/* Timeline */}
          <div>
            <h3 className="font-black text-gray-700 mb-3">Journey Timeline</h3>
            <div className="space-y-0">
              {STAGES.map((stage, i) => {
                const reached = stageReached(stage.key)
                const isUnloadingStage = stage.key === 'unloading'
                const showTs = !isUnloadingStage
                const ts = showTs ? vehicle[stage.timeField] : null
                const prev = i > 0 ? vehicle[STAGES[i-1].timeField] : null
                const dur = (reached && prev && ts && showTs) ? duration(prev, ts) : null
                const isCurrent = vehicle.status === stage.key
                const photo1 = stage.photoField ? vehicle[stage.photoField] : null
                const photo2 = stage.photoField2 ? vehicle[stage.photoField2] : null

                return (
                  <div key={stage.key} className="flex gap-3">
                    {/* Rail */}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold border-2 ${
                        reached
                          ? isCurrent ? 'bg-indigo-600 text-white border-indigo-600 ring-4 ring-indigo-200 animate-pulse'
                                       : 'bg-green-500 text-white border-green-500'
                          : 'bg-gray-100 text-gray-300 border-gray-200'
                      }`}>
                        {reached && !isCurrent ? '✓' : stage.icon}
                      </div>
                      {i < STAGES.length - 1 && (
                        <div className={`w-1 flex-1 min-h-[2.5rem] ${reached && stageReached(STAGES[i+1].key) ? 'bg-green-500' : 'bg-gray-200'}`} />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-5">
                      <div className={`font-black ${reached ? 'text-gray-800' : 'text-gray-300'}`}>{stage.label}</div>
                      <div className={`text-xs ${reached ? 'text-gray-500' : 'text-gray-300'}`}>
                        {isUnloadingStage
                          ? (reached ? (photo1 || photo2 ? 'Seal & gate photos captured' : 'In progress') : 'Pending')
                          : (ts ? fmt(ts) : reached ? '—' : 'Pending')}
                      </div>
                      {dur && <div className="text-xs text-indigo-600 font-semibold mt-0.5">⏱ took {dur}</div>}
                      {(photo1 || photo2) && reached && (
                        <div className="flex gap-2 mt-2">
                          {photo1 && (
                            <button onClick={() => setZoomPhoto(photoSrc(photo1))}
                              className="w-20 h-20 rounded-xl overflow-hidden border-2 border-gray-200 hover:border-indigo-500 transition">
                              <img src={photoSrc(photo1)} alt={stage.label} className="w-full h-full object-cover" />
                            </button>
                          )}
                          {photo2 && (
                            <button onClick={() => setZoomPhoto(photoSrc(photo2))}
                              className="w-20 h-20 rounded-xl overflow-hidden border-2 border-gray-200 hover:border-indigo-500 transition">
                              <img src={photoSrc(photo2)} alt={stage.label} className="w-full h-full object-cover" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Total time */}
          {vehicle.departed_time && (
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-4 text-center">
              <div className="text-xs font-bold text-indigo-600">TOTAL TIME ON SITE</div>
              <div className="text-2xl font-black text-indigo-800 mt-1">{duration(vehicle.arrival_time, vehicle.departed_time)}</div>
            </div>
          )}
          {!vehicle.departed_time && vehicle.offload_time && (
            <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 text-center">
              <div className="text-xs font-bold text-green-600">UNLOADING TIME</div>
              <div className="text-2xl font-black text-green-800 mt-1">{duration(vehicle.arrival_time, vehicle.offload_time)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Photo zoom */}
      {zoomPhoto && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onClick={() => setZoomPhoto(null)}>
          <img src={zoomPhoto} className="max-w-full max-h-full rounded-2xl" alt="zoom" />
          <button className="absolute top-4 right-4 text-white text-4xl w-12 h-12">×</button>
        </div>
      )}
    </div>
  )
}
