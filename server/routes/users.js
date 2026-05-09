const router = require('express').Router()
const db = require('../db')
const bcrypt = require('bcryptjs')
const emitter = require('../io')
const { authMiddleware, adminOnly, managerOrAdmin } = require('../middleware/auth')
const { tryDrainQueueOntoDock } = require('../queueHelpers')

const VALID_ROLES = ['admin', 'security', 'dock_supervisor', 'operation_manager']

router.use(authMiddleware)

// ── Dock assignment — accessible to admin AND operation_manager ───────────────
// Returns all dock_supervisors with their current dock assignment
router.get('/supervisors', managerOrAdmin, (req, res) => {
  const supervisors = db.prepare(`
    SELECT u.id, u.name, u.username, u.dock_id, u.active,
           d.dock_no as assigned_dock_no
    FROM users u
    LEFT JOIN docks d ON u.dock_id = d.id
    WHERE u.role = 'dock_supervisor' AND u.active = 1
    ORDER BY u.name
  `).all()
  res.json(supervisors)
})

// Assign / change a supervisor's dock — enforces one-to-one uniqueness
router.put('/:id/dock', managerOrAdmin, (req, res) => {
  const { dock_id } = req.body
  const userId = parseInt(req.params.id)

  const user = db.prepare(`SELECT * FROM users WHERE id=? AND role='dock_supervisor'`).get(userId)
  if (!user) return res.status(404).json({ error: 'Dock supervisor not found' })

  // Block reassignment if supervisor's CURRENT dock is actively in progress (gate open = red)
  if (user.dock_id) {
    const currentDock = db.prepare('SELECT * FROM docks WHERE id=?').get(user.dock_id)
    if (currentDock && currentDock.status === 'red') {
      return res.status(400).json({
        error: `Cannot reassign — ${currentDock.dock_no} has a vehicle actively in progress (gate is open). Complete or reject the vehicle first.`
      })
    }
  }

  if (dock_id) {
    // Check if this dock is already assigned to a DIFFERENT user
    const conflict = db.prepare(`SELECT id, name FROM users WHERE dock_id=? AND id != ?`).get(dock_id, userId)
    if (conflict) {
      return res.status(400).json({
        error: `Dock is already assigned to ${conflict.name}. Unassign them first.`
      })
    }
  }

  db.prepare(`UPDATE users SET dock_id=? WHERE id=?`).run(dock_id || null, userId)

  if (dock_id) tryDrainQueueOntoDock(Number(dock_id), req.user.id)

  res.json(db.prepare(`
    SELECT u.id, u.name, u.username, u.dock_id, d.dock_no as assigned_dock_no
    FROM users u LEFT JOIN docks d ON u.dock_id = d.id WHERE u.id=?
  `).get(userId))
})

// ── Admin-only routes below ───────────────────────────────────────────────────

router.get('/', managerOrAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.name, u.role, u.dock_id, u.active, u.created_at,
           u.password_plain, d.dock_no as assigned_dock_no
    FROM users u
    LEFT JOIN docks d ON u.dock_id = d.id
    ORDER BY u.role, u.name
  `).all()
  res.json(users)
})

router.post('/', managerOrAdmin, (req, res) => {
  const { username, password, name, role, dock_id } = req.body
  if (!username || !password || !name || !role) return res.status(400).json({ error: 'All fields required' })
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' })
  if (req.user.role !== 'admin' && !['security', 'dock_supervisor'].includes(role))
    return res.status(403).json({ error: 'Operation Manager can only create Security and Dock Supervisor accounts' })

  if (dock_id && role === 'dock_supervisor') {
    const conflict = db.prepare(`SELECT name FROM users WHERE dock_id=?`).get(dock_id)
    if (conflict) return res.status(400).json({ error: `Dock already assigned to ${conflict.name}` })
  }

  const hash = bcrypt.hashSync(password, 10)
  const dockId = role === 'dock_supervisor' ? (dock_id || null) : null
  try {
    const result = db.prepare(`INSERT INTO users (username,password_hash,password_plain,name,role,dock_id) VALUES (?,?,?,?,?,?)`)
      .run(username, hash, password, name, role, dockId)
    if (dockId) tryDrainQueueOntoDock(dockId, req.user.id)
    res.json({ id: result.lastInsertRowid, username, name, role, dock_id: dockId, active: 1 })
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Username already exists' })
    throw e
  }
})

router.put('/:id', managerOrAdmin, (req, res) => {
  const { name, role, active, password, dock_id } = req.body
  if (role && !VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' })
  if (req.user.role !== 'admin' && role && !['security', 'dock_supervisor'].includes(role))
    return res.status(403).json({ error: 'Operation Manager can only manage Security and Dock Supervisor accounts' })

  // Uniqueness check — ignore the current user's own dock
  const dockId = role === 'dock_supervisor' ? (dock_id || null) : null
  if (dockId) {
    const conflict = db.prepare(`SELECT name FROM users WHERE dock_id=? AND id != ?`).get(dockId, req.params.id)
    if (conflict) return res.status(400).json({ error: `Dock already assigned to ${conflict.name}` })
  }

  let sets = 'name=?, role=?, active=?, dock_id=?'
  let params = [name, role, active ?? 1, dockId]
  if (password) { sets += ', password_hash=?, password_plain=?'; params.push(bcrypt.hashSync(password, 10), password) }
  params.push(req.params.id)
  db.prepare(`UPDATE users SET ${sets} WHERE id=?`).run(...params)

  if (dockId && (active ?? 1)) tryDrainQueueOntoDock(dockId, req.user.id)

  res.json(db.prepare(`
    SELECT u.id, u.username, u.name, u.role, u.dock_id, u.active, u.password_plain,
           d.dock_no as assigned_dock_no
    FROM users u LEFT JOIN docks d ON u.dock_id = d.id WHERE u.id=?
  `).get(req.params.id))
})

// ── Bulk activate / deactivate users ─────────────────────────────────────────
router.post('/bulk-toggle', managerOrAdmin, (req, res) => {
  const { ids, active } = req.body
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' })
  const newActive = active ? 1 : 0

  for (const id of ids) {
    if (String(id) === String(req.user.id)) continue // never deactivate self
    const target = db.prepare('SELECT * FROM users WHERE id=?').get(id)
    if (!target) continue
    if (req.user.role !== 'admin' && !['security', 'dock_supervisor'].includes(target.role)) continue
    db.prepare('UPDATE users SET active=? WHERE id=?').run(newActive, id)
    // If deactivating a dock_supervisor, their dock becomes unmonitored
    // (dock stays open, but queue drain won't happen for it — OM can reassign)
  }

  emitter.emit('data_changed', { type: 'users' })
  res.json({ success: true })
})

// Delete user — admin can delete any (except self), OM can delete security/dock_supervisor
router.delete('/:id', managerOrAdmin, (req, res) => {
  const target = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id)
  if (!target) return res.status(404).json({ error: 'User not found' })
  if (String(target.id) === String(req.user.id)) return res.status(400).json({ error: 'Cannot delete your own account' })
  if (req.user.role !== 'admin' && !['security', 'dock_supervisor'].includes(target.role))
    return res.status(403).json({ error: 'Not allowed' })
  if (target.dock_id) db.prepare('UPDATE users SET dock_id=NULL WHERE id=?').run(target.id)
  db.prepare('DELETE FROM users WHERE id=?').run(target.id)
  res.json({ success: true })
})

module.exports = router
