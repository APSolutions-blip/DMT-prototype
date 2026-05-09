const db = require('./db')
const emitter = require('./io')
const log = require('./logger')

// Assign a specific queued vehicle to a dock (atomic).
function assignVehicleToDock(dockId, vehicleId, userId) {
  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare(`UPDATE vehicles SET status='assigned', assigned_dock_id=?, assigned_time=? WHERE id=?`)
      .run(dockId, now, vehicleId)
    db.prepare(`UPDATE docks SET status='orange' WHERE id=?`).run(dockId)
    db.prepare(`DELETE FROM queue WHERE vehicle_id=?`).run(vehicleId)
    db.prepare(`INSERT INTO events (vehicle_id,dock_id,event_type,created_by) VALUES (?,?,?,?)`)
      .run(vehicleId, dockId, 'DOCK_ASSIGNED', userId)
  })
  tx()
  emitter.emit('data_changed', { type: 'vehicles' })
}

function dockHasSupervisor(dockId) {
  return !!db.prepare(`SELECT id FROM users WHERE dock_id=? AND role='dock_supervisor' AND active=1`).get(dockId)
}

// Try to pull the oldest queued vehicle whose purpose matches this dock's
// type onto the given dock, if the dock is free (green + active) and has a
// supervisor. Inbound dock ↔ inbound vehicle, outbound dock ↔ outbound vehicle.
function tryDrainQueueOntoDock(dockId, userId) {
  if (!dockId) return null
  const dock = db.prepare(`SELECT * FROM docks WHERE id=? AND active=1 AND status='green'`).get(dockId)
  if (!dock) return null
  if (!dockHasSupervisor(dockId)) return null
  const dockType = dock.type || 'inbound'
  const nextQ = db.prepare(`
    SELECT q.vehicle_id FROM queue q
    JOIN vehicles v ON v.id = q.vehicle_id
    WHERE COALESCE(v.purpose,'inbound') = ?
    ORDER BY q.queued_at ASC LIMIT 1
  `).get(dockType)
  if (!nextQ) return null
  assignVehicleToDock(dockId, nextQ.vehicle_id, userId)
  const v = db.prepare(`SELECT vehicle_no FROM vehicles WHERE id=?`).get(nextQ.vehicle_id)
  log.info(`AUTO-DRAIN: ${v?.vehicle_no || nextQ.vehicle_id} → dock ${dock.dock_no} (${dockType})`)
  return dock
}

// Find the oldest free dock matching a vehicle's purpose that also has a
// supervisor. Used at arrival time.
function findFreeDockForPurpose(purpose) {
  return db.prepare(`
    SELECT d.* FROM docks d
    INNER JOIN users u ON u.dock_id = d.id AND u.role = 'dock_supervisor' AND u.active = 1
    WHERE d.status='green' AND d.active=1 AND COALESCE(d.type,'inbound') = ?
    ORDER BY d.dock_no LIMIT 1
  `).get(purpose)
}

module.exports = { assignVehicleToDock, dockHasSupervisor, tryDrainQueueOntoDock, findFreeDockForPurpose }
