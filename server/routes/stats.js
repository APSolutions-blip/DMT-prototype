const router = require('express').Router()
const db = require('../db')
const { authMiddleware, managerOrAdmin } = require('../middleware/auth')

router.use(authMiddleware, managerOrAdmin)

// ── Per-dock performance ────────────────────────────────────────────────────
// from/to are optional YYYY-MM-DD date strings.
// arrival_time is stored as ISO-8601 (e.g. 2026-04-23T10:30:00.000Z).
// We use DATE(arrival_time) to strip the time part before comparing so the
// T/Z format never causes a lexicographic mismatch with space-separated strings.
router.get('/performance', (req, res) => {
  const from = req.query.from || null   // 'YYYY-MM-DD'
  const to   = req.query.to   || null   // 'YYYY-MM-DD'

  // Use DATE() so ISO timestamps compare correctly against plain date strings
  const whereArrival = from && to
    ? `AND DATE(v.arrival_time) >= ? AND DATE(v.arrival_time) <= ?`
    : ''
  const arrivalParams = from && to ? [from, to] : []

  // "completed" = vehicle fully left the site (normally or as rejected departed)
  const completedExpr = `v.status IN ('offloaded','departed','rejected_departed')`

  // Dock stats
  const dockRows = db.prepare(`
    SELECT
      d.id, d.dock_no, d.status, d.active,
      COALESCE(d.type, 'inbound') AS type,
      COUNT(DISTINCT CASE WHEN ${completedExpr} THEN v.id END) AS processed,
      COUNT(DISTINCT CASE WHEN v.status IN ('assigned','unloading') THEN v.id END) AS current_load,
      AVG(CASE WHEN v.offload_time IS NOT NULL AND v.assigned_time IS NOT NULL
               THEN (julianday(v.offload_time) - julianday(v.assigned_time)) * 1440.0 END) AS avg_process_min,
      AVG(CASE WHEN v.departed_time IS NOT NULL AND v.arrival_time IS NOT NULL
               THEN (julianday(v.departed_time) - julianday(v.arrival_time)) * 1440.0 END) AS avg_total_min
    FROM docks d
    LEFT JOIN vehicles v ON v.assigned_dock_id = d.id ${whereArrival}
    GROUP BY d.id
    ORDER BY d.dock_no
  `).all(...arrivalParams)

  // Supervisor stats
  const supervisorRows = db.prepare(`
    SELECT
      u.id, u.name, u.username, u.active,
      d.id AS dock_id, d.dock_no,
      COALESCE(d.type, 'inbound') AS dock_type,
      COUNT(DISTINCT CASE WHEN ${completedExpr} THEN v.id END) AS processed,
      AVG(CASE WHEN v.offload_time IS NOT NULL AND v.assigned_time IS NOT NULL
               THEN (julianday(v.offload_time) - julianday(v.assigned_time)) * 1440.0 END) AS avg_process_min
    FROM users u
    LEFT JOIN docks d ON d.id = u.dock_id
    LEFT JOIN vehicles v ON v.assigned_dock_id = u.dock_id ${whereArrival}
    WHERE u.role = 'dock_supervisor' AND u.active = 1
    GROUP BY u.id
    ORDER BY processed DESC, u.name
  `).all(...arrivalParams)

  // Overall totals
  const totalsParams = from && to ? [from, to] : []
  const totalsWhere  = from && to
    ? `WHERE DATE(arrival_time) >= ? AND DATE(arrival_time) <= ?`
    : ''
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total,
      COUNT(CASE WHEN status IN ('departed','rejected_departed') THEN 1 END) AS departed,
      COUNT(CASE WHEN status = 'offloaded' THEN 1 END) AS offloaded,
      COUNT(CASE WHEN status IN ('assigned','unloading') THEN 1 END) AS active,
      COUNT(CASE WHEN status IN ('reported','waiting','rejection_pending','rejected_hold') THEN 1 END) AS waiting,
      COUNT(CASE WHEN status = 'rejected_departed' THEN 1 END) AS rejected,
      AVG(CASE WHEN departed_time IS NOT NULL
               THEN (julianday(departed_time) - julianday(arrival_time)) * 1440.0 END) AS avg_total_min
    FROM vehicles
    ${totalsWhere}
  `).get(...totalsParams)

  const round = (n) => n == null ? null : Math.round(n)

  res.json({
    totals: {
      ...totals,
      avg_total_min: round(totals.avg_total_min),
    },
    docks: dockRows.map(d => ({
      ...d,
      avg_process_min: round(d.avg_process_min),
      avg_total_min:   round(d.avg_total_min),
    })),
    supervisors: supervisorRows.map(s => ({
      ...s,
      avg_process_min: round(s.avg_process_min),
    })),
  })
})

module.exports = router
