const router = require('express').Router()
const db = require('../db')
const emitter = require('../io')
const { authMiddleware, adminOnly, managerOrAdmin } = require('../middleware/auth')
const { tryDrainQueueOntoDock } = require('../queueHelpers')

router.use(authMiddleware)

router.get('/', (req, res) => {
  const where = req.query.all === '1' ? '' : 'WHERE d.active = 1'
  const docks = db.prepare(`
    SELECT d.*,
      COALESCE(d.type,'inbound') as type,
      v.id as vehicle_id, v.vehicle_no, v.status as vehicle_status,
      v.arrival_time, v.assigned_time, v.gate_open_time, v.purpose as vehicle_purpose,
      u.id as supervisor_id, u.name as supervisor_name
    FROM docks d
    LEFT JOIN vehicles v ON v.assigned_dock_id = d.id AND v.status IN ('assigned', 'unloading')
    LEFT JOIN users u ON u.dock_id = d.id AND u.role = 'dock_supervisor' AND u.active = 1
    ${where}
    ORDER BY d.dock_no
  `).all()
  res.json(docks)
})

router.post('/', managerOrAdmin, (req, res) => {
  const { dock_no, supervisor_name, supervisor_phone, type } = req.body
  if (!dock_no) return res.status(400).json({ error: 'Dock number required' })
  const t = ['inbound','outbound'].includes(String(type).toLowerCase()) ? String(type).toLowerCase() : 'inbound'
  try {
    const result = db.prepare(`INSERT INTO docks (dock_no, supervisor_name, supervisor_phone, type) VALUES (?, ?, ?, ?)`)
      .run(dock_no.trim().toUpperCase(), supervisor_name || null, supervisor_phone || null, t)
    emitter.emit('data_changed', { type: 'docks' })
    res.json(db.prepare('SELECT * FROM docks WHERE id = ?').get(result.lastInsertRowid))
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Dock number already exists' })
    throw e
  }
})

router.put('/:id', managerOrAdmin, (req, res) => {
  const { dock_no, supervisor_name, supervisor_phone, active, type } = req.body
  if (!dock_no) return res.status(400).json({ error: 'Dock number required' })
  const normalized = dock_no.trim().toUpperCase()
  const clash = db.prepare(`SELECT id FROM docks WHERE dock_no = ? AND id != ?`).get(normalized, req.params.id)
  if (clash) return res.status(400).json({ error: 'Dock number already exists' })

  const current = db.prepare('SELECT * FROM docks WHERE id=?').get(req.params.id)
  if (!current) return res.status(404).json({ error: 'Dock not found' })
  const newType = type && ['inbound','outbound'].includes(String(type).toLowerCase())
    ? String(type).toLowerCase()
    : (current.type || 'inbound')
  const newActive = active ?? 1

  // Block type change if dock is occupied
  if (newType !== (current.type || 'inbound') && current.status !== 'green') {
    return res.status(400).json({ error: 'Free the dock before changing its type' })
  }

  // Block deactivation if dock is in use (open until closure)
  if (!newActive && current.status !== 'green') {
    return res.status(400).json({ error: 'Dock is in use — close it before deactivating' })
  }

  try {
    db.prepare(`UPDATE docks SET dock_no = ?, supervisor_name = ?, supervisor_phone = ?, active = ?, type = ? WHERE id = ?`)
      .run(normalized, supervisor_name || null, supervisor_phone || null, newActive, newType, req.params.id)

    // When deactivating: free all supervisors assigned to this dock
    if (!newActive) {
      db.prepare(`UPDATE users SET dock_id = NULL WHERE dock_id = ?`).run(req.params.id)
    }

    emitter.emit('data_changed', { type: 'docks' })
    if (newActive) tryDrainQueueOntoDock(Number(req.params.id), req.user.id)
    res.json(db.prepare('SELECT * FROM docks WHERE id = ?').get(req.params.id))
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Dock number already exists' })
    throw e
  }
})

router.delete('/:id', managerOrAdmin, (req, res) => {
  const dock = db.prepare('SELECT * FROM docks WHERE id = ?').get(req.params.id)
  if (!dock) return res.status(404).json({ error: 'Dock not found' })
  if (dock.status !== 'green') return res.status(400).json({ error: 'Dock is in use — close it before deactivating' })

  db.prepare('UPDATE docks SET active = 0 WHERE id = ?').run(req.params.id)
  // Free all supervisors assigned to this dock
  db.prepare('UPDATE users SET dock_id = NULL WHERE dock_id = ?').run(req.params.id)

  emitter.emit('data_changed', { type: 'docks' })
  res.json({ success: true })
})

// ── Bulk activate / deactivate docks ─────────────────────────────────────────
router.post('/bulk-toggle', managerOrAdmin, (req, res) => {
  const { ids, active } = req.body
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' })
  const newActive = active ? 1 : 0
  const errors = []

  for (const id of ids) {
    const dock = db.prepare('SELECT * FROM docks WHERE id=?').get(id)
    if (!dock) { errors.push(`Dock ${id} not found`); continue }
    if (!newActive && dock.status !== 'green') {
      errors.push(`${dock.dock_no} is in use — skipped`)
      continue
    }
    db.prepare('UPDATE docks SET active=? WHERE id=?').run(newActive, id)
    if (!newActive) db.prepare('UPDATE users SET dock_id=NULL WHERE dock_id=?').run(id)
    else tryDrainQueueOntoDock(Number(id), req.user.id)
  }

  emitter.emit('data_changed', { type: 'docks' })
  res.json({ success: true, errors })
})

module.exports = router
