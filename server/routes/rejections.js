const router = require('express').Router()
const path = require('path')
const multer = require('multer')
const db = require('../db')
const emitter = require('../io')
const log = require('../logger')
const { authMiddleware, managerOrAdmin } = require('../middleware/auth')
const { tryDrainQueueOntoDock } = require('../queueHelpers')

const UPLOADS_DIR = path.join(__dirname, '../uploads')
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`)
})
const imageFilter = (req, file, cb) => {
  if (/^image\/(jpeg|jpg|png|webp|heic|heif)$/i.test(file.mimetype)) return cb(null, true)
  cb(new Error('Only image files are allowed'))
}
const upload = multer({ storage, fileFilter: imageFilter, limits: { fileSize: 15 * 1024 * 1024 } })

router.use(authMiddleware)

// ── Dock supervisor raises a rejection on their vehicle ─────────────────────
router.post('/', upload.single('photo'), (req, res) => {
  const { vehicle_id, reason } = req.body
  if (!vehicle_id)        return res.status(400).json({ error: 'Vehicle required' })
  if (!reason?.trim())    return res.status(400).json({ error: 'Reason is required' })

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id=?').get(vehicle_id)
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' })
  if (!['assigned', 'unloading'].includes(vehicle.status)) {
    return res.status(400).json({ error: 'Only assigned/unloading vehicles can be rejected' })
  }

  // A supervisor can only reject a vehicle at their own dock.
  if (req.user.role === 'dock_supervisor' && req.user.dock_id !== vehicle.assigned_dock_id) {
    return res.status(403).json({ error: 'Not your dock' })
  }

  // No duplicate pending rejection
  const existing = db.prepare(`SELECT id FROM rejections WHERE vehicle_id=? AND status='pending'`).get(vehicle.id)
  if (existing) return res.status(400).json({ error: 'Rejection already pending for this vehicle' })

  const photo = req.file ? req.file.filename : null
  const dockId = vehicle.assigned_dock_id
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO rejections (vehicle_id, dock_id, supervisor_id, reason, photo) VALUES (?,?,?,?,?)`)
      .run(vehicle.id, dockId, req.user.id, reason.trim(), photo)
    db.prepare(`UPDATE vehicles SET status='rejection_pending', assigned_dock_id=NULL, assigned_time=NULL WHERE id=?`).run(vehicle.id)
    if (dockId) db.prepare(`UPDATE docks SET status='green' WHERE id=?`).run(dockId)
    db.prepare(`INSERT INTO events (vehicle_id,dock_id,event_type,photo,notes,created_by) VALUES (?,?,?,?,?,?)`)
      .run(vehicle.id, dockId, 'REJECTION_RAISED', photo, reason.trim(), req.user.id)
  })
  tx()

  // Freed dock → drain next vehicle of matching type from queue
  if (dockId) tryDrainQueueOntoDock(dockId, req.user.id)

  emitter.emit('data_changed', { type: 'rejections' })
  log.info(`REJECTION RAISED: ${vehicle.vehicle_no} @ dock ${dockId} | reason: ${reason.trim()} | by: ${req.user.name}`)
  res.json({ success: true })
})

// ── OM approves the rejection → vehicle enters rejected_hold ─────────────────
// Inbound: waits for rectification (OM marks resolved → re-queued).
// Outbound: waits for vehicle swap (OM swap-vehicle or Security re-registers same shipment).
router.post('/:id/approve', managerOrAdmin, (req, res) => {
  const rej = db.prepare('SELECT * FROM rejections WHERE id=?').get(req.params.id)
  if (!rej) return res.status(404).json({ error: 'Rejection not found' })
  if (rej.status !== 'pending') return res.status(400).json({ error: `Rejection already ${rej.status}` })

  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare(`UPDATE rejections SET status='approved', decided_by=?, decided_at=? WHERE id=?`).run(req.user.id, now, rej.id)
    db.prepare(`UPDATE vehicles SET status='rejected_hold' WHERE id=?`).run(rej.vehicle_id)
    db.prepare(`INSERT INTO events (vehicle_id,event_type,notes,created_by) VALUES (?,?,?,?)`)
      .run(rej.vehicle_id, 'REJECTION_APPROVED', `Rejection #${rej.id} approved`, req.user.id)
  })
  tx()

  emitter.emit('data_changed', { type: 'rejections' })
  res.json({ success: true })
})

// ── OM denies the rejection → vehicle returns to queue ───────────────────────
router.post('/:id/deny', managerOrAdmin, (req, res) => {
  const rej = db.prepare('SELECT * FROM rejections WHERE id=?').get(req.params.id)
  if (!rej) return res.status(404).json({ error: 'Rejection not found' })
  if (rej.status !== 'pending') return res.status(400).json({ error: `Rejection already ${rej.status}` })

  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare(`UPDATE rejections SET status='denied', decided_by=?, decided_at=? WHERE id=?`).run(req.user.id, now, rej.id)
    db.prepare(`UPDATE vehicles SET status='waiting' WHERE id=?`).run(rej.vehicle_id)
    db.prepare(`INSERT OR IGNORE INTO queue (vehicle_id) VALUES (?)`).run(rej.vehicle_id)
    db.prepare(`INSERT INTO events (vehicle_id,event_type,notes,created_by) VALUES (?,?,?,?)`)
      .run(rej.vehicle_id, 'REJECTION_DENIED', `Rejection #${rej.id} denied`, req.user.id)
  })
  tx()

  // Try to place the vehicle immediately on any free matching dock.
  const v = db.prepare('SELECT * FROM vehicles WHERE id=?').get(rej.vehicle_id)
  const purpose = v?.purpose || 'inbound'
  const dock = db.prepare(`
    SELECT d.id FROM docks d
    INNER JOIN users u ON u.dock_id=d.id AND u.role='dock_supervisor' AND u.active=1
    WHERE d.status='green' AND d.active=1 AND COALESCE(d.type,'inbound')=?
    ORDER BY d.dock_no LIMIT 1
  `).get(purpose)
  if (dock) tryDrainQueueOntoDock(dock.id, req.user.id)

  emitter.emit('data_changed', { type: 'rejections' })
  res.json({ success: true })
})

// ── OM marks an inbound approved rejection as resolved → back to queue ──────
router.post('/:id/resolve', managerOrAdmin, (req, res) => {
  const rej = db.prepare('SELECT * FROM rejections WHERE id=?').get(req.params.id)
  if (!rej) return res.status(404).json({ error: 'Rejection not found' })
  if (rej.status !== 'approved') return res.status(400).json({ error: 'Only approved rejections can be resolved' })

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id=?').get(rej.vehicle_id)
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' })
  if (vehicle.status !== 'rejected_hold') return res.status(400).json({ error: 'Vehicle is not on hold' })

  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare(`UPDATE rejections SET status='resolved', resolved_at=? WHERE id=?`).run(now, rej.id)
    db.prepare(`UPDATE vehicles SET status='waiting' WHERE id=?`).run(vehicle.id)
    db.prepare(`INSERT OR IGNORE INTO queue (vehicle_id) VALUES (?)`).run(vehicle.id)
    db.prepare(`INSERT INTO events (vehicle_id,event_type,notes,created_by) VALUES (?,?,?,?)`)
      .run(vehicle.id, 'REJECTION_RESOLVED', `Rejection #${rej.id} resolved — rectified`, req.user.id)
  })
  tx()

  // Try placing immediately
  const purpose = vehicle.purpose || 'inbound'
  const dock = db.prepare(`
    SELECT d.id FROM docks d
    INNER JOIN users u ON u.dock_id=d.id AND u.role='dock_supervisor' AND u.active=1
    WHERE d.status='green' AND d.active=1 AND COALESCE(d.type,'inbound')=?
    ORDER BY d.dock_no LIMIT 1
  `).get(purpose)
  if (dock) tryDrainQueueOntoDock(dock.id, req.user.id)

  emitter.emit('data_changed', { type: 'rejections' })
  res.json({ success: true })
})

// ── OM swaps the vehicle number for an outbound rejection ───────────────────
// Creates a NEW vehicle row for the same shipment; old row keeps history as
// rejected_hold (Security will depart it as rejected_departed).
router.post('/:id/swap-vehicle', managerOrAdmin, (req, res) => {
  const { new_vehicle_no, driver_name, driver_mobile } = req.body
  if (!new_vehicle_no?.trim()) return res.status(400).json({ error: 'New vehicle number required' })

  const rej = db.prepare('SELECT * FROM rejections WHERE id=?').get(req.params.id)
  if (!rej) return res.status(404).json({ error: 'Rejection not found' })
  if (rej.status !== 'approved') return res.status(400).json({ error: 'Only approved rejections can be swapped' })

  const oldVehicle = db.prepare('SELECT * FROM vehicles WHERE id=?').get(rej.vehicle_id)
  if (!oldVehicle) return res.status(404).json({ error: 'Vehicle not found' })
  if ((oldVehicle.purpose || 'inbound') !== 'outbound') {
    return res.status(400).json({ error: 'Swap is only for outbound rejections' })
  }
  if (oldVehicle.status !== 'rejected_hold') {
    return res.status(400).json({ error: 'Vehicle not on hold' })
  }

  const newPlate = new_vehicle_no.trim().toUpperCase()
  const shipment = oldVehicle.shipment_no
  const now = new Date().toISOString()

  let newVehicleId
  const tx = db.transaction(() => {
    // Archive plate history on old row, release its shipment
    const prev = oldVehicle.prev_vehicle_nos ? JSON.parse(oldVehicle.prev_vehicle_nos) : []
    prev.push(oldVehicle.vehicle_no)
    db.prepare(`UPDATE vehicles
                SET shipment_no = NULL,
                    prev_shipment_no = COALESCE(prev_shipment_no, ?),
                    prev_vehicle_nos = ?
                WHERE id = ?`)
      .run(shipment, JSON.stringify(prev), oldVehicle.id)

    const result = db.prepare(`
      INSERT INTO vehicles (vehicle_no, shipment_no, driver_name, driver_mobile, status, purpose, registered_by, arrival_time)
      VALUES (?, ?, ?, ?, 'reported', 'outbound', ?, ?)
    `).run(newPlate, shipment, driver_name?.trim() || oldVehicle.driver_name, driver_mobile?.trim() || oldVehicle.driver_mobile, req.user.id, now)
    newVehicleId = result.lastInsertRowid

    db.prepare(`UPDATE rejections SET status='resolved', resolved_at=? WHERE id=?`).run(now, rej.id)
    db.prepare(`INSERT INTO events (vehicle_id,event_type,notes,created_by) VALUES (?,?,?,?)`)
      .run(oldVehicle.id, 'VEHICLE_SWAPPED', `Replaced by ${newPlate} on shipment ${shipment}`, req.user.id)
    db.prepare(`INSERT INTO events (vehicle_id,event_type,notes,created_by) VALUES (?,?,?,?)`)
      .run(newVehicleId, 'ARRIVED', `Swap replacement for ${oldVehicle.vehicle_no}`, req.user.id)
  })
  tx()

  // Auto-assign the new vehicle to an outbound dock if free
  const dock = db.prepare(`
    SELECT d.* FROM docks d
    INNER JOIN users u ON u.dock_id=d.id AND u.role='dock_supervisor' AND u.active=1
    WHERE d.status='green' AND d.active=1 AND COALESCE(d.type,'inbound')='outbound'
    ORDER BY d.dock_no LIMIT 1
  `).get()
  if (dock) {
    const { assignVehicleToDock } = require('../queueHelpers')
    assignVehicleToDock(dock.id, newVehicleId, req.user.id)
  } else {
    const tx2 = db.transaction(() => {
      db.prepare(`UPDATE vehicles SET status='waiting' WHERE id=?`).run(newVehicleId)
      db.prepare(`INSERT OR IGNORE INTO queue (vehicle_id) VALUES (?)`).run(newVehicleId)
    })
    tx2()
  }

  emitter.emit('data_changed', { type: 'rejections' })
  log.info(`VEHICLE SWAP: ${oldVehicle.vehicle_no} → ${newPlate} on shipment ${shipment} | by: ${req.user.name}`)
  res.json({ success: true, new_vehicle_id: newVehicleId })
})

// ── List rejections (filters: status) ───────────────────────────────────────
router.get('/', (req, res) => {
  const status = req.query.status
  const base = `
    SELECT r.*,
           v.vehicle_no, v.shipment_no, v.purpose, v.status as vehicle_status, v.prev_vehicle_nos,
           d.dock_no,
           su.name as supervisor_name, du.name as decided_by_name
    FROM rejections r
    LEFT JOIN vehicles v ON v.id = r.vehicle_id
    LEFT JOIN docks d    ON d.id = r.dock_id
    LEFT JOIN users su   ON su.id = r.supervisor_id
    LEFT JOIN users du   ON du.id = r.decided_by
  `
  const rows = status
    ? db.prepare(base + ` WHERE r.status = ? ORDER BY r.created_at DESC`).all(status)
    : db.prepare(base + ` ORDER BY r.created_at DESC LIMIT 500`).all()
  res.json(rows)
})

module.exports = router
