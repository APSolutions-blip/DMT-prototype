import { STATUS, elapsed } from '../constants'

export default function VehicleCard({ vehicle, actions }) {
  const s = STATUS[vehicle.status] || STATUS.reported

  return (
    <div className={`bg-white rounded-2xl shadow p-4 border-l-4 ${s.border}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl font-black text-gray-800">{vehicle.vehicle_no}</span>
            <span className={`text-xs font-black px-2 py-0.5 rounded-full text-white ${s.color}`}>
              {s.label}
            </span>
          </div>
          {vehicle.shipment_no && (
            <div className="text-sm text-gray-600 mt-1">📦 {vehicle.shipment_no}</div>
          )}
          {vehicle.driver_name && (
            <div className="text-xs text-gray-500 mt-0.5">
              👤 {vehicle.driver_name}{vehicle.driver_mobile ? ` · 📞 ${vehicle.driver_mobile}` : ''}
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-1.5">
            {vehicle.dock_no && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-semibold">
                🏭 {vehicle.dock_no}
              </span>
            )}
            <span className="text-xs text-gray-400">{elapsed(vehicle.arrival_time)}</span>
          </div>
        </div>
        {actions && <div className="flex-shrink-0">{actions}</div>}
      </div>
    </div>
  )
}
