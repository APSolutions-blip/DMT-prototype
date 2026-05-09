const router = require('express').Router()
const fs = require('fs')
const path = require('path')
const PDFDocument = require('pdfkit')
const db = require('../db')
const emitter = require('../io')
const log = require('../logger')
const { authMiddleware } = require('../middleware/auth')
const multer = require('multer')

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

function deletePhotos(...filenames) {
  for (const f of filenames) {
    if (!f) continue
    const p = path.join(UPLOADS_DIR, path.basename(f))
    fs.unlink(p, () => {})
  }
}

router.use(authMiddleware)

// ── helpers ─────────────────────────────────────────────────────────────────

function dockHasSupervisor(dockId) {
  return !!db.prepare(`SELECT id FROM users WHERE dock_id=? AND role='dock_supervisor' AND active=1`).get(dockId)
}

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

function tryAutoAssign(vehicleId, userId, purpose = 'inbound') {
  const dock = db.prepare(`
    SELECT d.* FROM docks d
    INNER JOIN users u ON u.dock_id = d.id AND u.role = 'dock_supervisor' AND u.active = 1
    WHERE d.status='green' AND d.active=1 AND COALESCE(d.type,'inbound') = ?
    ORDER BY d.dock_no LIMIT 1
  `).get(purpose)
  if (!dock) {
    const tx = db.transaction(() => {
      db.prepare(`UPDATE vehicles SET status='waiting' WHERE id=?`).run(vehicleId)
      db.prepare(`INSERT OR IGNORE INTO queue (vehicle_id) VALUES (?)`).run(vehicleId)
    })
    tx()
    return null
  }
  assignVehicleToDock(dock.id, vehicleId, userId)
  return dock
}

function getVehicleWithDock(id) {
  return db.prepare(`
    SELECT v.*, d.dock_no, d.supervisor_name, d.supervisor_phone
    FROM vehicles v LEFT JOIN docks d ON v.assigned_dock_id = d.id
    WHERE v.id = ?
  `).get(id)
}

// Generate a unique sequential gate pass number for today: GP-YYYYMMDD-NNNN
function generateGatePassNo() {
  const d = new Date()
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const prefix = `GP-${ymd}-`
  const last = db.prepare(`SELECT gate_pass_no FROM vehicles WHERE gate_pass_no LIKE ? ORDER BY gate_pass_no DESC LIMIT 1`).get(prefix + '%')
  const nextN = last ? (parseInt(String(last.gate_pass_no).slice(-4)) || 0) + 1 : 1
  return prefix + String(nextN).padStart(4, '0')
}

// ── Lookup shipment before registration ─────────────────────────────────────
// Returns status of a shipment so the UI can decide the next step:
//   { found: false }                     → new shipment, proceed with registration
//   { found: true, status, purpose, vehicle_no, … }
router.get('/lookup', (req, res) => {
  const { shipment_no } = req.query
  if (!shipment_no?.trim()) return res.status(400).json({ error: 'shipment_no required' })
  const v = db.prepare(`
    SELECT v.*, d.dock_no FROM vehicles v
    LEFT JOIN docks d ON v.assigned_dock_id = d.id
    WHERE v.shipment_no = ?
  `).get(shipment_no.trim())
  if (!v) return res.json({ found: false })
  res.json({
    found: true,
    id: v.id,
    vehicle_no: v.vehicle_no,
    status: v.status,
    purpose: v.purpose || 'inbound',
    driver_name: v.driver_name,
    driver_mobile: v.driver_mobile,
    dock_no: v.dock_no,
    arrival_time: v.arrival_time,
  })
})

// ── Register vehicle arrival ─────────────────────────────────────────────────
router.post('/register', upload.single('photo'), (req, res) => {
  const { vehicle_no, shipment_no, driver_name, driver_mobile } = req.body
  if (!vehicle_no?.trim()) return res.status(400).json({ error: 'Vehicle number required' })

  const purposeIn = String(req.body.purpose || 'inbound').toLowerCase()
  const purpose = ['inbound', 'outbound'].includes(purposeIn) ? purposeIn : 'inbound'
  const shipTrim = shipment_no?.trim()
  const newPlate = vehicle_no.trim().toUpperCase()

  // Duplicate shipment handling:
  //   - If an existing vehicle with this shipment is in rejected_hold (approved
  //     outbound rejection waiting for swap), treat this as the replacement:
  //     move shipment to the new record, archive plate on old record, flag old
  //     record as ready for "Rejected Departure".
  //   - Otherwise, normal duplicate → 400.
  let swappedFrom = null
  if (shipTrim) {
    const dup = db.prepare(`SELECT * FROM vehicles WHERE shipment_no=?`).get(shipTrim)
    if (dup) {
      if (dup.status === 'rejected_hold' && (dup.purpose || 'inbound') === 'outbound') {
        swappedFrom = dup
      } else {
        if (req.file) deletePhotos(req.file.filename)
        return res.status(400).json({ error: `Shipment number already registered` })
      }
    }
  }

  const photo = req.file ? req.file.filename : null
  const now = new Date().toISOString()

  let vehicleId
  try {
    const tx = db.transaction(() => {
      if (swappedFrom) {
        // archive old record: drop shipment ownership so the new row can own it
        const prev = swappedFrom.prev_vehicle_nos ? JSON.parse(swappedFrom.prev_vehicle_nos) : []
        prev.push(swappedFrom.vehicle_no)
        db.prepare(`UPDATE vehicles
                    SET shipment_no = NULL,
                        prev_shipment_no = COALESCE(prev_shipment_no, ?),
                        prev_vehicle_nos = ?
                    WHERE id = ?`)
          .run(shipTrim, JSON.stringify(prev), swappedFrom.id)
        db.prepare(`INSERT INTO events (vehicle_id,event_type,notes,created_by) VALUES (?,?,?,?)`)
          .run(swappedFrom.id, 'VEHICLE_SWAPPED', `Replaced by ${newPlate} on shipment ${shipTrim}`, req.user.id)
        // Auto-resolve the rejection — vehicle has been swapped, no further OM action needed
        db.prepare(`UPDATE rejections SET status='resolved', resolved_at=? WHERE vehicle_id=? AND status IN ('pending','approved')`)
          .run(now, swappedFrom.id)
      }
      const gatePassNo = generateGatePassNo()
      const result = db.prepare(`
        INSERT INTO vehicles (vehicle_no, shipment_no, driver_name, driver_mobile, arrival_photo, arrival_time, status, purpose, registered_by, gate_pass_no)
        VALUES (?, ?, ?, ?, ?, ?, 'reported', ?, ?, ?)
      `).run(
        newPlate,
        shipTrim || null,
        driver_name?.trim() || null,
        driver_mobile?.trim() || null,
        photo,
        now,
        purpose,
        req.user.id,
        gatePassNo
      )
      vehicleId = result.lastInsertRowid
      db.prepare(`INSERT INTO events (vehicle_id,event_type,photo,notes,created_by) VALUES (?,?,?,?,?)`)
        .run(vehicleId, 'ARRIVED', photo, `Gate Pass: ${gatePassNo}`, req.user.id)
    })
    tx()
  } catch (e) {
    if (photo) deletePhotos(photo)
    if (String(e.message).includes('UNIQUE')) return res.status(400).json({ error: 'Shipment number already registered' })
    throw e
  }

  emitter.emit('data_changed', { type: 'vehicles' })
  const assignedDock = tryAutoAssign(vehicleId, req.user.id, purpose)
  log.info(`ARRIVED: ${newPlate} | purpose: ${purpose} | shipment: ${shipTrim || '-'} | driver: ${driver_name || '-'} | dock: ${assignedDock ? assignedDock.dock_no : 'QUEUE'}${swappedFrom ? ' | swapped from ' + swappedFrom.vehicle_no : ''} | by: ${req.user.name}`)
  res.json({ vehicle: getVehicleWithDock(vehicleId), assignedDock, swappedFrom: swappedFrom ? { id: swappedFrom.id, vehicle_no: swappedFrom.vehicle_no } : null })
})

// ── Admin/OM: manually assign / reassign dock ────────────────────────────────
router.post('/:id/assign-dock', (req, res) => {
  const { dock_id } = req.body
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.id)
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' })

  const dock = db.prepare(`SELECT * FROM docks WHERE id=? AND active=1`).get(dock_id)
  if (!dock) return res.status(404).json({ error: 'Dock not found or inactive' })

  const sup = db.prepare(`SELECT id FROM users WHERE dock_id=? AND role='dock_supervisor' AND active=1`).get(dock_id)
  if (!sup) return res.status(400).json({ error: 'Cannot assign — this dock has no supervisor' })

  const vPurpose = vehicle.purpose || 'inbound'
  const dType = dock.type || 'inbound'
  if (vPurpose !== dType) {
    return res.status(400).json({ error: `Cannot assign — ${vPurpose} vehicle cannot go to ${dType} dock` })
  }

  // Resolve any pending/approved rejection on this vehicle: we're overriding
  if (['rejection_pending', 'rejected_hold'].includes(vehicle.status)) {
    db.prepare(`UPDATE rejections SET status='resolved', resolved_at=? WHERE vehicle_id=? AND status IN ('pending','approved')`)
      .run(new Date().toISOString(), vehicle.id)
    db.prepare(`DELETE FROM queue WHERE vehicle_id=?`).run(vehicle.id)
  }

  if (vehicle.assigned_dock_id && vehicle.assigned_dock_id !== Number(dock_id)) {
    db.prepare(`UPDATE docks SET status='green' WHERE id=?`).run(vehicle.assigned_dock_id)
    const nextQ = db.prepare(`SELECT vehicle_id FROM queue ORDER BY queued_at ASC LIMIT 1`).get()
    if (nextQ && nextQ.vehicle_id !== vehicle.id) {
      assignVehicleToDock(vehicle.assigned_dock_id, nextQ.vehicle_id, req.user.id)
    }
  }

  assignVehicleToDock(dock.id, req.params.id, req.user.id)
  log.info(`DOCK OVERRIDE: ${vehicle.vehicle_no} → ${dock.dock_no} | by: ${req.user.name}`)
  emitter.emit('data_changed', { type: 'vehicles' })
  res.json(getVehicleWithDock(req.params.id))
})

// ── Admin/OM: unassign vehicle from dock → move to queue ────────────────────
router.post('/:id/unassign', (req, res) => {
  if (!['admin', 'operation_manager'].includes(req.user?.role))
    return res.status(403).json({ error: 'Not allowed' })

  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.id)
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' })
  if (!['assigned'].includes(vehicle.status))
    return res.status(400).json({ error: 'Only assigned vehicles can be moved to queue' })

  const dockId = vehicle.assigned_dock_id
  const tx = db.transaction(() => {
    db.prepare(`UPDATE vehicles SET status='waiting', assigned_dock_id=NULL, assigned_time=NULL WHERE id=?`).run(req.params.id)
    db.prepare(`INSERT OR IGNORE INTO queue (vehicle_id) VALUES (?)`).run(req.params.id)
    if (dockId) {
      db.prepare(`UPDATE docks SET status='green' WHERE id=?`).run(dockId)
    }
    db.prepare(`INSERT INTO events (vehicle_id,dock_id,event_type,created_by) VALUES (?,?,?,?)`)
      .run(req.params.id, dockId, 'UNASSIGNED', req.user.id)
  })
  tx()

  if (dockId && dockHasSupervisor(dockId)) {
    const nextQ = db.prepare(`SELECT vehicle_id FROM queue WHERE vehicle_id != ? ORDER BY queued_at ASC LIMIT 1`).get(req.params.id)
    if (nextQ) assignVehicleToDock(dockId, nextQ.vehicle_id, req.user.id)
  }

  emitter.emit('data_changed', { type: 'vehicles' })
  log.info(`UNASSIGNED: ${vehicle.vehicle_no} → QUEUE | by: ${req.user.name}`)
  res.json({ success: true })
})

// ── Dock Supervisor: seal check + open gate → dock RED ──────────────────────
router.post('/:id/start-unloading', upload.fields([{ name: 'seal_photo' }, { name: 'gate_photo' }]), (req, res) => {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.id)
  if (!vehicle?.assigned_dock_id) return res.status(400).json({ error: 'Vehicle not assigned to a dock' })

  if (req.user.role === 'dock_supervisor' && req.user.dock_id && req.user.dock_id !== vehicle.assigned_dock_id) {
    return res.status(403).json({ error: 'This vehicle is not at your dock' })
  }

  const sealFile = req.files?.seal_photo?.[0]?.filename || null
  const gateFile = req.files?.gate_photo?.[0]?.filename || null

  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare(`UPDATE vehicles SET status='unloading', seal_photo=?, gate_photo=?, gate_open_time=? WHERE id=?`)
      .run(sealFile, gateFile, now, req.params.id)
    db.prepare(`UPDATE docks SET status='red' WHERE id=?`).run(vehicle.assigned_dock_id)
    db.prepare(`INSERT INTO events (vehicle_id,dock_id,event_type,photo,created_by) VALUES (?,?,?,?,?)`)
      .run(req.params.id, vehicle.assigned_dock_id, 'GATE_OPENED', sealFile, req.user.id)
  })
  tx()

  emitter.emit('data_changed', { type: 'vehicles' })
  log.info(`GATE OPEN: ${vehicle.vehicle_no} | dock: ${vehicle.assigned_dock_id} | by: ${req.user.name}`)
  res.json(getVehicleWithDock(req.params.id))
})

// ── Dock Supervisor: vehicle offloaded → dock GREEN ──────────────────────────
// Inbound:  photo = offloaded vehicle photo (optional)
// Outbound: photo = material stacking photo (required), close_seal_photo = seal applied to loaded trailer (required)
router.post('/:id/offloaded', upload.fields([{ name: 'photo' }, { name: 'close_seal_photo' }]), (req, res) => {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.id)
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' })

  if (req.user.role === 'dock_supervisor' && req.user.dock_id && req.user.dock_id !== vehicle.assigned_dock_id) {
    return res.status(403).json({ error: 'This vehicle is not at your dock' })
  }

  const photo      = req.files?.photo?.[0]?.filename || null
  const closeSeal  = req.files?.close_seal_photo?.[0]?.filename || null
  const isOutbound = (vehicle.purpose || 'inbound') === 'outbound'

  if (isOutbound && !photo)      return res.status(400).json({ error: 'Material stacking photo is required' })
  if (isOutbound && !closeSeal)  return res.status(400).json({ error: 'Closing seal photo is required' })

  const now = new Date().toISOString()

  const tx = db.transaction(() => {
    db.prepare(`UPDATE vehicles SET status='offloaded', offload_photo=?, close_seal_photo=?, offload_time=? WHERE id=?`)
      .run(photo, closeSeal, now, req.params.id)
    db.prepare(`INSERT INTO events (vehicle_id,dock_id,event_type,photo,created_by) VALUES (?,?,?,?,?)`)
      .run(req.params.id, vehicle.assigned_dock_id, 'OFFLOADED', photo, req.user.id)
    if (closeSeal) {
      db.prepare(`INSERT INTO events (vehicle_id,dock_id,event_type,photo,notes,created_by) VALUES (?,?,?,?,?,?)`)
        .run(req.params.id, vehicle.assigned_dock_id, 'SEAL_APPLIED', closeSeal, 'Closing seal', req.user.id)
    }
    if (vehicle.assigned_dock_id) {
      db.prepare(`UPDATE docks SET status='green' WHERE id=?`).run(vehicle.assigned_dock_id)
    }
  })
  tx()

  if (vehicle.assigned_dock_id && dockHasSupervisor(vehicle.assigned_dock_id)) {
    const nextQ = db.prepare(`SELECT vehicle_id FROM queue ORDER BY queued_at ASC LIMIT 1`).get()
    if (nextQ) assignVehicleToDock(vehicle.assigned_dock_id, nextQ.vehicle_id, req.user.id)
  }

  emitter.emit('data_changed', { type: 'vehicles' })
  log.info(`OFFLOADED: ${vehicle.vehicle_no} | by: ${req.user.name}`)
  res.json({ success: true })
})

// ── Security: mark vehicle departed ─────────────────────────────────────────
// Gate-pass photo is required — Security must capture the stamped/signed gate
// pass before the vehicle rolls out. Handles offloaded → departed AND
// rejected_hold → rejected_departed.
router.post('/:id/depart', upload.single('gate_pass_photo'), (req, res) => {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.id)
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' })

  let newStatus
  let eventType
  if (vehicle.status === 'offloaded') {
    newStatus = 'departed'; eventType = 'DEPARTED'
  } else if (vehicle.status === 'rejected_hold') {
    newStatus = 'rejected_departed'; eventType = 'REJECTED_DEPARTED'
  } else {
    if (req.file) deletePhotos(req.file.filename)
    return res.status(400).json({ error: 'Vehicle is not ready to depart' })
  }

  if (!req.file) return res.status(400).json({ error: 'Gate pass photo is required' })
  const gatePassPhoto = req.file.filename

  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare(`UPDATE vehicles SET status=?, departed_time=?, gate_pass_photo=? WHERE id=?`)
      .run(newStatus, now, gatePassPhoto, req.params.id)
    db.prepare(`DELETE FROM queue WHERE vehicle_id=?`).run(req.params.id)
    db.prepare(`INSERT INTO events (vehicle_id,event_type,photo,created_by) VALUES (?,?,?,?)`)
      .run(req.params.id, eventType, gatePassPhoto, req.user.id)
    // Auto-resolve any open rejection when a rejected vehicle departs
    if (newStatus === 'rejected_departed') {
      db.prepare(`UPDATE rejections SET status='resolved', resolved_at=? WHERE vehicle_id=? AND status IN ('pending','approved')`)
        .run(now, req.params.id)
    }
  })
  tx()

  emitter.emit('data_changed', { type: 'vehicles' })
  log.info(`${eventType}: ${vehicle.vehicle_no} | gate_pass: ${vehicle.gate_pass_no || '-'} | by: ${req.user.name}`)
  res.json({ success: true })
})

// ── Admin/OM: delete vehicle (only before unloading starts) ─────────────────
router.delete('/:id', (req, res) => {
  if (!['admin', 'operation_manager'].includes(req.user?.role))
    return res.status(403).json({ error: 'Not allowed' })
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id=?').get(req.params.id)
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found' })
  if (['unloading', 'offloaded', 'departed'].includes(vehicle.status))
    return res.status(400).json({ error: 'Cannot delete — loading already started' })

  const tx = db.transaction(() => {
    if (vehicle.assigned_dock_id) {
      db.prepare(`UPDATE docks SET status='green' WHERE id=?`).run(vehicle.assigned_dock_id)
    }
    db.prepare(`DELETE FROM queue WHERE vehicle_id=?`).run(req.params.id)
    db.prepare(`DELETE FROM events WHERE vehicle_id=?`).run(req.params.id)
    db.prepare(`DELETE FROM vehicles WHERE id=?`).run(req.params.id)
  })
  tx()

  deletePhotos(vehicle.arrival_photo, vehicle.seal_photo, vehicle.gate_photo, vehicle.offload_photo)

  emitter.emit('data_changed', { type: 'vehicles' })
  log.info(`DELETED: ${vehicle.vehicle_no} | by: ${req.user.name}`)
  res.json({ success: true })
})

// ── Queries ──────────────────────────────────────────────────────────────────

router.get('/active', (req, res) => {
  const { dock_id } = req.query
  let sql = `
    SELECT v.*, d.dock_no, d.supervisor_name, d.type as dock_type, u.name as registered_by_name
    FROM vehicles v
    LEFT JOIN docks d ON v.assigned_dock_id = d.id
    LEFT JOIN users u ON v.registered_by = u.id
    WHERE v.status NOT IN ('departed', 'rejected_departed')
  `
  const params = []
  if (dock_id) { sql += ` AND v.assigned_dock_id = ?`; params.push(dock_id) }
  sql += ` ORDER BY v.arrival_time DESC`
  res.json(db.prepare(sql).all(...params))
})

router.get('/queue', (req, res) => {
  res.json(db.prepare(`
    SELECT v.*, q.queued_at FROM queue q
    JOIN vehicles v ON q.vehicle_id = v.id
    ORDER BY q.queued_at ASC
  `).all())
})

// History — supports ?from=YYYY-MM-DD&to=YYYY-MM-DD or ?date=YYYY-MM-DD or ?hours=N
// Unbounded queries are capped to 2000 rows to protect memory on large DBs.
router.get('/history', (req, res) => {
  const { date, hours, from, to } = req.query
  const base = `
    SELECT v.*, d.dock_no, u.name as registered_by_name
    FROM vehicles v
    LEFT JOIN docks d ON v.assigned_dock_id = d.id
    LEFT JOIN users u ON v.registered_by = u.id
  `
  if (from && to) {
    res.json(db.prepare(base + ` WHERE DATE(v.arrival_time) >= ? AND DATE(v.arrival_time) <= ? ORDER BY v.arrival_time DESC`).all(from, to))
  } else if (date) {
    res.json(db.prepare(base + ` WHERE DATE(v.arrival_time) = ? ORDER BY v.arrival_time DESC`).all(date))
  } else if (hours) {
    res.json(db.prepare(base + ` WHERE v.arrival_time >= datetime('now','-${parseInt(hours)} hours') ORDER BY v.arrival_time DESC`).all())
  } else {
    res.json(db.prepare(base + ` ORDER BY v.arrival_time DESC LIMIT 2000`).all())
  }
})

// ── PDF helper utilities ─────────────────────────────────────────────────────

function pdfFmtTs(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function pdfFmtDur(start, end) {
  if (!start || !end) return null
  const ms = new Date(end) - new Date(start)
  if (ms <= 0) return null
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins} min`
  const hrs = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${hrs}h ${m}m` : `${hrs}h`
}

function tryAddPhoto(doc, filename, x, y, w, h) {
  if (!filename) return false
  const p = path.join(UPLOADS_DIR, path.basename(filename))
  if (!fs.existsSync(p)) return false
  try {
    doc.image(p, x, y, { fit: [w, h], align: 'center', valign: 'center' })
    return true
  } catch { return false }
}

// ── Gate-pass PDF ───────────────────────────────────────────────────────────
// A5 gate pass with vehicle plate photo, dock/supervisor info, and GATE IN /
// GATE OUT stamp boxes so Security can physically stamp both sections.
router.get('/:id/gate-pass.pdf', (req, res) => {
  const v = db.prepare(`
    SELECT v.*, d.dock_no, d.supervisor_name, u.name as registered_by_name
    FROM vehicles v
    LEFT JOIN docks d ON v.assigned_dock_id = d.id
    LEFT JOIN users u ON v.registered_by = u.id
    WHERE v.id = ?
  `).get(req.params.id)
  if (!v) return res.status(404).json({ error: 'Vehicle not found' })
  if (!v.gate_pass_no) return res.status(400).json({ error: 'Gate pass not generated for this vehicle' })

  const isOut = (v.purpose || 'inbound') === 'outbound'
  const purposeLbl = isOut ? '📤 OUTBOUND — Loading' : '📥 INBOUND — Unloading'
  const purposeColor = isOut ? '#D97706' : '#0284C7'

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="${v.gate_pass_no}.pdf"`)

  const doc = new PDFDocument({ size: 'A5', margins: { top: 0, bottom: 0, left: 0, right: 0 } })
  doc.pipe(res)

  const W = doc.page.width   // 419.53
  const H = doc.page.height  // 595.28
  const pad = 36

  // ── Header band ─────────────────────────────────────────
  doc.rect(0, 0, W, 66).fill('#4338CA')
  doc.fillColor('white').font('Helvetica-Bold').fontSize(18)
    .text('VEHICLE GATE PASS', pad, 16, { width: W - pad * 2 })
  doc.font('Helvetica').fontSize(9).fillColor('#C7D2FE')
    .text('DMT · Dock Management Tool', pad, 42, { width: W - pad * 2 })

  // ── Right column: purpose badge + plate photo ───────────
  const rightW = 100
  const rightX = W - pad - rightW

  // Purpose badge
  doc.roundedRect(rightX, 76, rightW, 22, 4).fill(purposeColor)
  doc.fillColor('white').font('Helvetica-Bold').fontSize(8)
    .text(purposeLbl, rightX, 82, { width: rightW, align: 'center' })

  // Plate photo below badge
  const photoX = rightX, photoY = 102, photoW = rightW, photoH = 68
  const hadPhoto = tryAddPhoto(doc, v.arrival_photo, photoX, photoY, photoW, photoH)
  if (!hadPhoto) {
    doc.rect(photoX, photoY, photoW, photoH).lineWidth(0.5).strokeColor('#CBD5E1').stroke()
    doc.font('Helvetica').fontSize(7).fillColor('#94A3B8')
      .text('Vehicle\nPlate Photo', photoX, photoY + 22, { width: photoW, align: 'center' })
  }

  // ── Left column: Gate pass number + issued ──────────────
  const leftW = rightX - pad - 8
  doc.font('Helvetica').fontSize(8).fillColor('#64748B').text('GATE PASS NO.', pad, 78, { width: leftW })
  doc.font('Helvetica-Bold').fontSize(19).fillColor('#4338CA').text(v.gate_pass_no, pad, 90, { width: leftW })
  doc.font('Helvetica').fontSize(8).fillColor('#64748B')
    .text('Issued: ' + pdfFmtTs(v.arrival_time), pad, 116, { width: leftW })

  // ── Divider ─────────────────────────────────────────────
  const divY = 178
  doc.moveTo(pad, divY).lineTo(W - pad, divY).lineWidth(0.75).strokeColor('#E2E8F0').stroke()

  // ── Vehicle number box ──────────────────────────────────
  const vboxY = divY + 10
  doc.roundedRect(pad, vboxY, W - pad * 2, 52, 5).lineWidth(1.5).strokeColor('#4338CA').stroke()
  doc.font('Helvetica').fontSize(8).fillColor('#64748B').text('VEHICLE NUMBER', pad + 12, vboxY + 8)
  doc.font('Helvetica-Bold').fontSize(24).fillColor('#0F172A')
    .text(v.vehicle_no, pad + 12, vboxY + 20, { characterSpacing: 2 })

  // ── Details table ────────────────────────────────────────
  let y = vboxY + 66
  const rows = [
    ['Shipment No.',  v.shipment_no     || '—'],
    ['Driver Name',   v.driver_name     || '—'],
    ['Driver Mobile', v.driver_mobile   || '—'],
    ['Dock No.',      v.dock_no         || 'Pending assignment'],
    ['Supervisor',    v.supervisor_name || '—'],
    ['Registered By', v.registered_by_name || '—'],
  ]
  const colW = 108
  rows.forEach(([k, val]) => {
    doc.font('Helvetica').fontSize(9).fillColor('#64748B').text(k, pad, y, { width: colW })
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#0F172A')
      .text(String(val), pad + colW + 8, y, { width: W - pad * 2 - colW - 8 })
    y += 20
  })

  // ── GATE IN / GATE OUT stamp boxes ──────────────────────
  y += 12
  const boxW = (W - pad * 2 - 10) / 2
  const boxH = 92

  // GATE IN
  doc.roundedRect(pad, y, boxW, boxH, 5).lineWidth(1).strokeColor('#4338CA').stroke()
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#4338CA')
    .text('GATE IN', pad, y + 8, { width: boxW, align: 'center' })
  doc.font('Helvetica').fontSize(7.5).fillColor('#64748B').text('Date & Time:', pad + 8, y + 26)
  doc.moveTo(pad + 8, y + 42).lineTo(pad + boxW - 8, y + 42).lineWidth(0.5).strokeColor('#CBD5E1').stroke()
  doc.font('Helvetica').fontSize(7.5).fillColor('#64748B').text('Security Stamp & Signature:', pad + 8, y + 48)
  doc.moveTo(pad + 8, y + 80).lineTo(pad + boxW - 8, y + 80).stroke()

  // GATE OUT
  const box2X = pad + boxW + 10
  doc.roundedRect(box2X, y, boxW, boxH, 5).lineWidth(1).strokeColor('#DC2626').stroke()
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#DC2626')
    .text('GATE OUT', box2X, y + 8, { width: boxW, align: 'center' })
  doc.font('Helvetica').fontSize(7.5).fillColor('#64748B').text('Date & Time:', box2X + 8, y + 26)
  doc.moveTo(box2X + 8, y + 42).lineTo(box2X + boxW - 8, y + 42).lineWidth(0.5).strokeColor('#CBD5E1').stroke()
  doc.font('Helvetica').fontSize(7.5).fillColor('#64748B').text('Security Stamp & Signature:', box2X + 8, y + 48)
  doc.moveTo(box2X + 8, y + 80).lineTo(box2X + boxW - 8, y + 80).stroke()

  // ── Footer ───────────────────────────────────────────────
  doc.rect(0, H - 40, W, 40).fill('#EEF2FF')
  doc.font('Helvetica').fontSize(7.5).fillColor('#6366F1')
    .text('This pass must be presented at exit. Security stamps both IN and OUT boxes. Pass photo will be stored with the shipment record.',
      pad, H - 26, { width: W - pad * 2, align: 'center' })

  doc.end()
})

// ── Dock-completion PDF ──────────────────────────────────────────────────────
// Full A5 summary generated after the dock supervisor marks a vehicle
// offloaded / loaded. Shows timestamps + durations for every stage, dock
// details, supervisor, and thumbnail photos (plate, stacking, closing seal).
router.get('/:id/dock-out.pdf', (req, res) => {
  const v = db.prepare(`
    SELECT v.*, d.dock_no, d.supervisor_name, u.name as registered_by_name
    FROM vehicles v
    LEFT JOIN docks d ON v.assigned_dock_id = d.id
    LEFT JOIN users u ON v.registered_by = u.id
    WHERE v.id = ?
  `).get(req.params.id)
  if (!v) return res.status(404).json({ error: 'Vehicle not found' })
  if (!['offloaded', 'departed', 'rejected_departed'].includes(v.status))
    return res.status(400).json({ error: 'Dock completion report only available after offloading / loading is complete' })

  const isOut = (v.purpose || 'inbound') === 'outbound'
  const actionLabel = isOut ? 'Loaded' : 'Offloaded'
  const purposeColor = isOut ? '#D97706' : '#0284C7'

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="${v.vehicle_no}-dock-completion.pdf"`)

  const doc = new PDFDocument({ size: 'A5', margins: { top: 0, bottom: 0, left: 0, right: 0 } })
  doc.pipe(res)

  const W = doc.page.width
  const H = doc.page.height
  const pad = 36

  // ── Header band ─────────────────────────────────────────
  doc.rect(0, 0, W, 66).fill('#065F46')
  doc.fillColor('white').font('Helvetica-Bold').fontSize(16)
    .text('DOCK COMPLETION REPORT', pad, 16, { width: W - pad * 2 })
  doc.font('Helvetica').fontSize(9).fillColor('#A7F3D0')
    .text('DMT · Dock Management Tool', pad, 42, { width: W - pad * 2 })

  // ── Vehicle info + plate photo ──────────────────────────
  let y = 76
  doc.font('Helvetica-Bold').fontSize(22).fillColor('#0F172A')
    .text(v.vehicle_no, pad, y, { characterSpacing: 1.5, width: W - pad * 2 - 100 })
  if (v.gate_pass_no) {
    doc.font('Helvetica').fontSize(8.5).fillColor('#64748B')
      .text(`Gate Pass: ${v.gate_pass_no}`, pad, y + 28)
  }
  doc.roundedRect(pad, y + 42, 118, 20, 4).fill(purposeColor)
  doc.fillColor('white').font('Helvetica-Bold').fontSize(8)
    .text(isOut ? '📤 OUTBOUND — Loading' : '📥 INBOUND — Unloading', pad, y + 48, { width: 118, align: 'center' })

  // Plate photo — top right
  tryAddPhoto(doc, v.arrival_photo, W - pad - 90, y, 90, 66)

  // ── Timeline section ─────────────────────────────────────
  y = 158
  doc.moveTo(pad, y).lineTo(W - pad, y).lineWidth(0.75).strokeColor('#E2E8F0').stroke()
  y += 8
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#065F46').text('TIMELINE', pad, y)
  y += 16

  const col1 = pad, col2 = pad + 134, col3 = pad + 254
  const rowH = 22

  // Table header
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#94A3B8')
  doc.text('STAGE', col1, y)
  doc.text('DATE / TIME', col2, y)
  doc.text('DURATION', col3, y)
  y += 13
  doc.moveTo(pad, y).lineTo(W - pad, y).lineWidth(0.5).strokeColor('#E2E8F0').stroke()
  y += 5

  const stages = [
    {
      label: 'Gate In (Arrived)',
      ts: v.arrival_time,
      dur: null,
      note: null
    },
    {
      label: 'Dock Assigned',
      ts: v.assigned_time,
      dur: pdfFmtDur(v.arrival_time, v.assigned_time),
      note: `Dock: ${v.dock_no || '—'}  ·  Supervisor: ${v.supervisor_name || '—'}`
    },
    {
      label: 'Gate Opened',
      ts: v.gate_open_time,
      dur: pdfFmtDur(v.assigned_time, v.gate_open_time),
      note: null
    },
    {
      label: actionLabel,
      ts: v.offload_time,
      dur: pdfFmtDur(v.gate_open_time, v.offload_time),
      note: null
    },
  ]

  stages.forEach((s, i) => {
    if (i % 2 === 1) {
      doc.rect(pad - 4, y - 2, W - pad * 2 + 8, rowH + (s.note ? 14 : 0)).fill('#F8FAFC')
    }
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0F172A').text(s.label, col1, y, { width: 130 })
    doc.font('Helvetica').fontSize(8.5).fillColor(s.ts ? '#0F172A' : '#94A3B8')
      .text(pdfFmtTs(s.ts), col2, y, { width: 116 })
    if (s.dur) {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#065F46').text(s.dur, col3, y, { width: 80 })
    } else {
      doc.font('Helvetica').fontSize(8.5).fillColor('#94A3B8').text('—', col3, y)
    }
    y += rowH
    if (s.note) {
      doc.font('Helvetica').fontSize(7.5).fillColor('#64748B').text(s.note, col1 + 8, y - 4, { width: W - pad * 2 - 8 })
      y += 12
    }
  })

  // Total time bar
  y += 4
  const totalDur = pdfFmtDur(v.arrival_time, v.offload_time)
  doc.roundedRect(pad, y, W - pad * 2, 30, 5).fill('#ECFDF5')
  doc.font('Helvetica').fontSize(8.5).fillColor('#065F46')
    .text('TOTAL TIME ON SITE:', pad + 10, y + 9, { width: 140 })
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#065F46')
    .text(totalDur || '—', pad + 160, y + 5, { width: 140 })
  y += 40

  // ── Dock info row ────────────────────────────────────────
  doc.moveTo(pad, y).lineTo(W - pad, y).lineWidth(0.75).strokeColor('#E2E8F0').stroke()
  y += 8
  const dockRows = [
    ['Dock No.',    v.dock_no          || '—'],
    ['Supervisor',  v.supervisor_name  || '—'],
    ['Shipment',    v.shipment_no      || '—'],
    ['Driver',      v.driver_name ? `${v.driver_name}${v.driver_mobile ? '  ·  ' + v.driver_mobile : ''}` : '—'],
  ]
  const dcW = 88
  dockRows.forEach(([k, val]) => {
    doc.font('Helvetica').fontSize(8.5).fillColor('#64748B').text(k, pad, y, { width: dcW })
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0F172A')
      .text(String(val), pad + dcW + 8, y, { width: W - pad * 2 - dcW - 8 })
    y += 17
  })

  // ── Evidence photos ──────────────────────────────────────
  const photos = []
  if (v.offload_photo)    photos.push({ file: v.offload_photo,    label: isOut ? 'Stacking Photo' : 'Offloaded Photo' })
  if (v.close_seal_photo) photos.push({ file: v.close_seal_photo, label: 'Closing Seal' })
  if (v.arrival_photo)    photos.push({ file: v.arrival_photo,    label: 'Plate Photo' })

  if (photos.length > 0 && y < H - 110) {
    y += 6
    doc.moveTo(pad, y).lineTo(W - pad, y).lineWidth(0.75).strokeColor('#E2E8F0').stroke()
    y += 8
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#065F46').text('EVIDENCE PHOTOS', pad, y)
    y += 14
    const maxPhotos = Math.min(photos.length, 3)
    const pW = Math.floor((W - pad * 2 - (maxPhotos - 1) * 8) / maxPhotos)
    const pH = 66
    photos.slice(0, maxPhotos).forEach((p, i) => {
      const px = pad + i * (pW + 8)
      const drawn = tryAddPhoto(doc, p.file, px, y, pW, pH)
      if (!drawn) {
        doc.rect(px, y, pW, pH).lineWidth(0.5).strokeColor('#CBD5E1').stroke()
        doc.font('Helvetica').fontSize(7).fillColor('#94A3B8')
          .text('No photo', px, y + pH / 2 - 5, { width: pW, align: 'center' })
      }
      doc.font('Helvetica').fontSize(7).fillColor('#64748B')
        .text(p.label, px, y + pH + 3, { width: pW, align: 'center' })
    })
    y += pH + 16
  }

  // ── Footer ───────────────────────────────────────────────
  doc.rect(0, H - 38, W, 38).fill('#F0FDF4')
  doc.font('Helvetica').fontSize(7.5).fillColor('#6B7280')
    .text(`Generated: ${pdfFmtTs(new Date().toISOString())}  ·  ${v.vehicle_no}  ·  ${v.gate_pass_no || 'No gate pass'}`,
      pad, H - 24, { width: W - pad * 2, align: 'center' })

  doc.end()
})

// ── Vehicle Exit Receipt PDF ─────────────────────────────────────────────────
// Handover document for the transporter / driver after departure. Contains the
// full journey log, all timestamps + durations, and the signed gate-pass photo
// captured at exit — so the driver can show it to the vehicle owner / fleet mgr.
router.get('/:id/exit-receipt.pdf', (req, res) => {
  const v = db.prepare(`
    SELECT v.*, d.dock_no, d.supervisor_name, u.name as registered_by_name
    FROM vehicles v
    LEFT JOIN docks d ON v.assigned_dock_id = d.id
    LEFT JOIN users u ON v.registered_by = u.id
    WHERE v.id = ?
  `).get(req.params.id)
  if (!v) return res.status(404).json({ error: 'Vehicle not found' })
  if (!['departed', 'rejected_departed'].includes(v.status))
    return res.status(400).json({ error: 'Exit receipt only available after departure' })

  const isOut     = (v.purpose || 'inbound') === 'outbound'
  const isRejected = v.status === 'rejected_departed'
  const purposeLbl = isOut ? '📤 OUTBOUND — Loading' : '📥 INBOUND — Unloading'
  const purposeColor = isOut ? '#D97706' : '#0284C7'

  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="${v.vehicle_no}-exit-receipt.pdf"`)

  const doc = new PDFDocument({ size: 'A5', margins: { top: 0, bottom: 0, left: 0, right: 0 } })
  doc.pipe(res)

  const W = doc.page.width
  const H = doc.page.height
  const pad = 36

  // ── Header ──────────────────────────────────────────────
  const headerColor = isRejected ? '#991B1B' : '#0F766E'
  doc.rect(0, 0, W, 66).fill(headerColor)
  doc.fillColor('white').font('Helvetica-Bold').fontSize(16)
    .text('VEHICLE EXIT RECEIPT', pad, 16, { width: W - pad * 2 })
  doc.font('Helvetica').fontSize(9).fillColor(isRejected ? '#FCA5A5' : '#99F6E4')
    .text(isRejected ? 'DMT · Rejected Departure' : 'DMT · Dock Management Tool', pad, 42, { width: W - pad * 2 })

  // ── Vehicle no + gate pass ───────────────────────────────
  let y = 76
  doc.font('Helvetica-Bold').fontSize(22).fillColor('#0F172A')
    .text(v.vehicle_no, pad, y, { characterSpacing: 1.5, width: W - pad * 2 - 100 })
  if (v.gate_pass_no) {
    doc.font('Helvetica').fontSize(8.5).fillColor('#64748B').text(`Gate Pass: ${v.gate_pass_no}`, pad, y + 28)
  }
  doc.roundedRect(pad, y + 42, 118, 20, 4).fill(isRejected ? '#991B1B' : purposeColor)
  doc.fillColor('white').font('Helvetica-Bold').fontSize(8)
    .text(isRejected ? '🚫 REJECTED DEPARTURE' : purposeLbl, pad, y + 48, { width: 118, align: 'center' })

  // Plate photo top-right
  tryAddPhoto(doc, v.arrival_photo, W - pad - 90, y, 90, 66)

  // ── Journey log ──────────────────────────────────────────
  y = 156
  doc.moveTo(pad, y).lineTo(W - pad, y).lineWidth(0.75).strokeColor('#E2E8F0').stroke()
  y += 8
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(headerColor).text('JOURNEY LOG', pad, y)
  y += 16

  const col1 = pad, col2 = pad + 128, col3 = pad + 252
  // Column headers
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#94A3B8')
  doc.text('STAGE', col1, y)
  doc.text('DATE / TIME', col2, y)
  doc.text('DURATION', col3, y)
  y += 13
  doc.moveTo(pad, y).lineTo(W - pad, y).lineWidth(0.5).strokeColor('#E2E8F0').stroke()
  y += 5

  const stages = [
    { label: 'Gate In (Arrived)',  ts: v.arrival_time,   dur: null },
    { label: 'Dock Assigned',      ts: v.assigned_time,  dur: pdfFmtDur(v.arrival_time,  v.assigned_time),
      note: v.dock_no ? `Dock: ${v.dock_no}  ·  Supervisor: ${v.supervisor_name || '—'}` : null },
    { label: 'Gate Opened',        ts: v.gate_open_time, dur: pdfFmtDur(v.assigned_time, v.gate_open_time) },
    { label: isOut ? 'Loaded' : 'Offloaded', ts: v.offload_time, dur: pdfFmtDur(v.gate_open_time, v.offload_time) },
    { label: 'Gate Out (Departed)',ts: v.departed_time,  dur: pdfFmtDur(v.offload_time,  v.departed_time) },
  ]

  const rowH = 22
  stages.forEach((s, i) => {
    if (!s.ts && !s.note) return   // skip stages that never happened (e.g. rejected before offload)
    if (i % 2 === 1) {
      doc.rect(pad - 4, y - 2, W - pad * 2 + 8, rowH + (s.note ? 13 : 0)).fill('#F8FAFC')
    }
    const isDeparted = s.label.includes('Departed')
    doc.font('Helvetica-Bold').fontSize(8.5)
      .fillColor(isDeparted ? headerColor : '#0F172A')
      .text(s.label, col1, y, { width: 124 })
    doc.font('Helvetica').fontSize(8.5).fillColor(s.ts ? '#0F172A' : '#94A3B8')
      .text(pdfFmtTs(s.ts), col2, y, { width: 120 })
    if (s.dur) {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(headerColor).text(s.dur, col3, y, { width: 78 })
    } else {
      doc.font('Helvetica').fontSize(8.5).fillColor('#94A3B8').text('—', col3, y)
    }
    y += rowH
    if (s.note) {
      doc.font('Helvetica').fontSize(7.5).fillColor('#64748B').text(s.note, col1 + 8, y - 4, { width: W - pad * 2 - 8 })
      y += 12
    }
  })

  // ── Total time on site ───────────────────────────────────
  y += 4
  const totalDur = pdfFmtDur(v.arrival_time, v.departed_time)
  doc.roundedRect(pad, y, W - pad * 2, 30, 5).fill(isRejected ? '#FEF2F2' : '#F0FDFA')
  doc.font('Helvetica').fontSize(8.5).fillColor(headerColor)
    .text('TOTAL TIME ON SITE:', pad + 10, y + 9, { width: 148 })
  doc.font('Helvetica-Bold').fontSize(14).fillColor(headerColor)
    .text(totalDur || '—', pad + 162, y + 5, { width: 130 })
  y += 40

  // ── Signed gate pass photo ───────────────────────────────
  if (v.gate_pass_photo && y < H - 130) {
    doc.moveTo(pad, y).lineTo(W - pad, y).lineWidth(0.75).strokeColor('#E2E8F0').stroke()
    y += 8
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(headerColor)
      .text('SIGNED GATE PASS — Captured at Exit', pad, y)
    y += 12
    const gpH = Math.min(110, H - y - 50)
    const drawn = tryAddPhoto(doc, v.gate_pass_photo, pad, y, W - pad * 2, gpH)
    if (!drawn) {
      doc.rect(pad, y, W - pad * 2, gpH).lineWidth(0.5).strokeColor('#CBD5E1').stroke()
      doc.font('Helvetica').fontSize(8).fillColor('#94A3B8')
        .text('Gate pass photo not available', pad, y + gpH / 2 - 6, { width: W - pad * 2, align: 'center' })
    }
    y += gpH + 8
  }

  // ── Footer ───────────────────────────────────────────────
  doc.rect(0, H - 44, W, 44).fill(isRejected ? '#FEF2F2' : '#F0FDFA')
  doc.font('Helvetica-Bold').fontSize(8).fillColor(headerColor)
    .text('This receipt confirms the vehicle has completed its visit and departed the premises.', pad, H - 34, { width: W - pad * 2, align: 'center' })
  doc.font('Helvetica').fontSize(7).fillColor('#94A3B8')
    .text(`Generated: ${pdfFmtTs(new Date().toISOString())}  ·  DMT — Dock Management Tool`, pad, H - 18, { width: W - pad * 2, align: 'center' })

  doc.end()
})

module.exports = router
