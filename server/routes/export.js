const router = require('express').Router()
const ExcelJS = require('exceljs')
const db = require('../db')
const { authMiddleware, managerOrAdmin } = require('../middleware/auth')

router.use(authMiddleware)

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
}

const diffMins = (from, to) => {
  if (!from || !to) return ''
  const m = Math.round((new Date(to) - new Date(from)) / 60000)
  return m >= 0 ? m : ''
}

// Styling constants
const HDR_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
const HDR_FONT  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' }
const HDR_ALIGN = { vertical: 'middle', horizontal: 'center', wrapText: true }
const THIN      = { style: 'thin', color: { argb: 'FFD0D0D0' } }
const BORDER    = { top: THIN, bottom: THIN, left: THIN, right: THIN }
const ODD_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9FC' } }
const EVN_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }

function styleHeader(ws, rowNum = 1) {
  const row = ws.getRow(rowNum)
  row.height = 36
  row.eachCell(cell => {
    cell.fill = HDR_FILL; cell.font = HDR_FONT
    cell.alignment = HDR_ALIGN; cell.border = BORDER
  })
}

function styleData(row, isOdd) {
  row.height = 20
  row.eachCell({ includeEmpty: true }, cell => {
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false }
    cell.border = BORDER
    cell.font = { name: 'Calibri', size: 10 }
    if (!cell.fill || !cell.fill.fgColor || cell.fill.fgColor.argb === 'FFFFFFFF') {
      cell.fill = isOdd ? ODD_FILL : EVN_FILL
    }
  })
}

function addLink(row, colKey, filename, baseUrl) {
  if (!filename) return
  const cell = row.getCell(colKey)
  cell.value = { text: '📷 View', hyperlink: `${baseUrl}/uploads/${filename}` }
  cell.font = { color: { argb: 'FF0563C1' }, underline: true, bold: true, size: 10 }
}

// ── Main Excel export ─────────────────────────────────────────────────────────
router.get('/excel', async (req, res) => {
  const { date, from, to } = req.query

  // ── 1. Load vehicles ───────────────────────────────────────────────────────
  const baseSQL = `
    SELECT v.*,
           d.dock_no, d.type AS dock_type,
           sup.name  AS supervisor_name,
           reg.name  AS entry_by
    FROM vehicles v
    LEFT JOIN docks d   ON v.assigned_dock_id = d.id
    LEFT JOIN users sup ON sup.dock_id = d.id AND sup.role = 'dock_supervisor' AND sup.active = 1
    LEFT JOIN users reg ON reg.id = v.registered_by
  `
  let vehicles
  if (from && to) {
    vehicles = db.prepare(baseSQL + ` WHERE DATE(v.arrival_time) >= ? AND DATE(v.arrival_time) <= ? ORDER BY v.arrival_time ASC`).all(from, to)
  } else if (date) {
    vehicles = db.prepare(baseSQL + ` WHERE DATE(v.arrival_time) = ? ORDER BY v.arrival_time ASC`).all(date)
  } else {
    vehicles = db.prepare(baseSQL + ` ORDER BY v.arrival_time DESC`).all()
  }

  const ids = vehicles.map(v => v.id)
  const ph  = ids.map(() => '?').join(',')

  // ── 2. Load events with user names ────────────────────────────────────────
  const events = ids.length
    ? db.prepare(`
        SELECT e.vehicle_id, e.event_type, e.created_at, u.name AS user_name
        FROM events e LEFT JOIN users u ON u.id = e.created_by
        WHERE e.vehicle_id IN (${ph}) ORDER BY e.created_at ASC
      `).all(...ids)
    : []

  // Build event maps: vehicle_id → { EVENT_TYPE: first_user_name }
  const evtMap = {}
  for (const e of events) {
    if (!evtMap[e.vehicle_id]) evtMap[e.vehicle_id] = {}
    if (!evtMap[e.vehicle_id][e.event_type]) {
      evtMap[e.vehicle_id][e.event_type] = e.user_name || ''
    }
  }

  // ── 3. Load rejections ────────────────────────────────────────────────────
  const rejections = ids.length
    ? db.prepare(`
        SELECT r.*, u1.name AS raised_by_name, u2.name AS decided_by_name
        FROM rejections r
        LEFT JOIN users u1 ON u1.id = r.supervisor_id
        LEFT JOIN users u2 ON u2.id = r.decided_by
        WHERE r.vehicle_id IN (${ph}) ORDER BY r.created_at DESC
      `).all(...ids)
    : []

  const rejMap = {}
  for (const r of rejections) {
    if (!rejMap[r.vehicle_id]) rejMap[r.vehicle_id] = r // keep latest
  }

  // ── 4. Build "previous vehicle no" lookup ─────────────────────────────────
  // A swapped-out vehicle has prev_shipment_no = the shipment it was replaced on.
  // So for the NEW vehicle (which now owns that shipment_no), its "previous vehicle"
  // is whichever record has prev_shipment_no = new_vehicle.shipment_no.
  const prevVehMap = {} // shipment_no → old vehicle_no
  const swapped = db.prepare(`SELECT vehicle_no, prev_shipment_no FROM vehicles WHERE prev_shipment_no IS NOT NULL`).all()
  for (const s of swapped) {
    prevVehMap[s.prev_shipment_no] = s.vehicle_no
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`
  const wb = new ExcelJS.Workbook()
  wb.creator = 'DMT'; wb.created = new Date()

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 1 — Vehicle Log
  // ══════════════════════════════════════════════════════════════════════════
  const ws = wb.addWorksheet('Vehicle Log', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
  })

  ws.columns = [
    // ── Identity ──────────────────────────────────────────────────────────
    { header: 'S.No',                  key: 'sno',               width: 5  },
    { header: 'Vehicle No',            key: 'vehicle_no',        width: 16 },
    { header: 'Purpose',               key: 'purpose',           width: 11 },
    { header: 'Shipment No',           key: 'shipment_no',       width: 16 },
    { header: 'Previous Vehicle No',   key: 'prev_vehicle_no',   width: 18 },
    { header: 'Previous Shipment No',  key: 'prev_shipment_no',  width: 18 },
    { header: 'Driver Name',           key: 'driver_name',       width: 18 },
    { header: 'Driver Mobile',         key: 'driver_mobile',     width: 14 },
    // ── Dock ─────────────────────────────────────────────────────────────
    { header: 'Dock No',               key: 'dock_no',           width: 9  },
    { header: 'Dock Type',             key: 'dock_type',         width: 10 },
    { header: 'Supervisor',            key: 'supervisor_name',   width: 18 },
    { header: 'Status',                key: 'status',            width: 18 },
    // ── Timestamps ───────────────────────────────────────────────────────
    { header: 'Arrival Time\n(Entry)', key: 'arrival_time',      width: 20 },
    { header: 'Dock Assigned\nTime',   key: 'assigned_time',     width: 20 },
    { header: 'Gate Open\nTime',       key: 'gate_open_time',    width: 20 },
    { header: 'Dock Close\nTime',      key: 'offload_time',      width: 20 },
    { header: 'Departed\nTime',        key: 'departed_time',     width: 20 },
    // ── Time intervals (minutes) ──────────────────────────────────────────
    { header: 'Gate→Dock\nAssigned\n(min)', key: 'mins_gate_dock',    width: 12 },
    { header: 'Dock Assigned\n→Gate Open\n(min)', key: 'mins_dock_gate', width: 13 },
    { header: 'Gate Open\n→Dock Close\n(min)',     key: 'mins_gate_close', width: 13 },
    { header: 'Dock Close\n→Departed\n(min)',       key: 'mins_close_dept', width: 13 },
    { header: 'Total TAT\n(min)',       key: 'total_tat',         width: 11 },
    // ── Personnel ─────────────────────────────────────────────────────────
    { header: 'Entry By',              key: 'entry_by',          width: 16 },
    { header: 'Gate Opened By',        key: 'gate_by',           width: 16 },
    { header: 'Unloaded/\nLoaded By',  key: 'offload_by',        width: 16 },
    { header: 'Departed By',           key: 'depart_by',         width: 16 },
    // ── Rejection ─────────────────────────────────────────────────────────
    { header: 'Rejection\nReason',     key: 'rej_reason',        width: 28 },
    { header: 'Rejection\nStatus',     key: 'rej_status',        width: 14 },
    { header: 'Rejected By\n(Supervisor)', key: 'rej_by',        width: 18 },
    { header: 'Rejection\nRaised At',  key: 'rej_raised',        width: 20 },
    { header: 'Rejection\nDecision By',key: 'rej_decided_by',    width: 16 },
    { header: 'Rejection\nDecided At', key: 'rej_decided_at',    width: 20 },
    // ── Photos ────────────────────────────────────────────────────────────
    { header: 'Arrival\nPhoto',        key: 'p_arrival',         width: 11 },
    { header: 'Gate Check\nPhoto',     key: 'p_seal',            width: 11 },
    { header: 'Gate Open\nPhoto',      key: 'p_gate',            width: 11 },
    { header: 'Offload/\nStacking\nPhoto', key: 'p_offload',     width: 11 },
    { header: 'Rejection\nPhoto',      key: 'p_rej',             width: 11 },
  ]

  styleHeader(ws)

  const STATUS_FILL = {
    reported:          'FFBFDBFE',
    waiting:           'FFFFF3CD',
    assigned:          'FFFDE68A',
    unloading:         'FFFED7AA',
    offloaded:         'FFD1FAE5',
    departed:          'FFE2E8F0',
    rejection_pending: 'FFFDE8D8',
    rejected_hold:     'FFFECACA',
    rejected_departed: 'FFE5E7EB',
  }
  const STATUS_LABEL = {
    reported: 'Reported', waiting: 'Waiting', assigned: 'Dock Assigned',
    unloading: 'Gate Open', offloaded: 'Dock Closed', departed: 'Departed',
    rejection_pending: 'Rejection Pending', rejected_hold: 'Rejected Hold',
    rejected_departed: 'Rejected Departed',
  }

  vehicles.forEach((v, idx) => {
    const ev  = evtMap[v.id] || {}
    const rej = rejMap[v.id]

    // "Previous Vehicle No" for this row = the old plate that was swapped out
    // for the same shipment. Stored via: swapped vehicle has prev_shipment_no = this shipment.
    const prevVehicleNo = (v.shipment_no && prevVehMap[v.shipment_no]) || ''

    const row = ws.addRow({
      sno:              idx + 1,
      vehicle_no:       v.vehicle_no,
      purpose:          (v.purpose || 'inbound') === 'outbound' ? 'OUTBOUND' : 'INBOUND',
      shipment_no:      v.shipment_no || '',
      prev_vehicle_no:  prevVehicleNo,
      prev_shipment_no: v.prev_shipment_no || '',
      driver_name:      v.driver_name || '',
      driver_mobile:    v.driver_mobile || '',

      dock_no:          v.dock_no || '',
      dock_type:        v.dock_type ? v.dock_type.toUpperCase() : '',
      supervisor_name:  v.supervisor_name || '',
      status:           STATUS_LABEL[v.status] || v.status,

      arrival_time:     fmt(v.arrival_time),
      assigned_time:    fmt(v.assigned_time),
      gate_open_time:   fmt(v.gate_open_time),
      offload_time:     fmt(v.offload_time),
      departed_time:    fmt(v.departed_time),

      // Intervals
      mins_gate_dock:   diffMins(v.arrival_time,   v.assigned_time),
      mins_dock_gate:   diffMins(v.assigned_time,  v.gate_open_time),
      mins_gate_close:  diffMins(v.gate_open_time, v.offload_time),
      mins_close_dept:  diffMins(v.offload_time,   v.departed_time),
      total_tat:        diffMins(v.arrival_time,   v.departed_time || v.offload_time),

      // Personnel
      entry_by:         v.entry_by || '',
      gate_by:          ev['GATE_OPENED'] || '',
      offload_by:       ev['OFFLOADED']   || ev['LOADED'] || '',
      depart_by:        ev['DEPARTED']    || ev['REJECTED_DEPARTED'] || '',

      // Rejection
      rej_reason:       rej ? rej.reason : '',
      rej_status:       rej ? rej.status.toUpperCase() : '',
      rej_by:           rej ? (rej.raised_by_name || '') : '',
      rej_raised:       rej ? fmt(rej.created_at) : '',
      rej_decided_by:   rej ? (rej.decided_by_name || '') : '',
      rej_decided_at:   rej ? fmt(rej.decided_at) : '',

      // Photos (set as empty; hyperlinks added below)
      p_arrival: '', p_seal: '', p_gate: '', p_offload: '', p_rej: '',
    })

    styleData(row, idx % 2 === 1)

    // Status colour
    const sColor = STATUS_FILL[v.status] || 'FFFFFFFF'
    const statusCell = row.getCell('status')
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sColor } }
    statusCell.font = { bold: true, size: 10 }

    // Purpose colour
    const pCell = row.getCell('purpose')
    pCell.fill = { type: 'pattern', pattern: 'solid',
      fgColor: { argb: (v.purpose || 'inbound') === 'outbound' ? 'FFFEF3C7' : 'FFE0F2FE' } }
    pCell.font = { bold: true, size: 10 }

    // Highlight time interval columns
    ;['mins_gate_dock','mins_dock_gate','mins_gate_close','mins_close_dept','total_tat'].forEach(k => {
      const c = row.getCell(k)
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: idx % 2 === 1 ? 'FFEEF2FF' : 'FFF5F3FF' } }
      c.font = { bold: true, size: 10 }
    })

    // Photo links
    addLink(row, 'p_arrival', v.arrival_photo,  baseUrl)
    addLink(row, 'p_seal',    v.seal_photo,      baseUrl)
    addLink(row, 'p_gate',    v.gate_photo,      baseUrl)
    addLink(row, 'p_offload', v.offload_photo,   baseUrl)
    if (rej?.photo) addLink(row, 'p_rej', rej.photo, baseUrl)
  })

  // Auto-filter on header row
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } }

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 2 — Rejections
  // ══════════════════════════════════════════════════════════════════════════
  const wsR = wb.addWorksheet('Rejections', { views: [{ state: 'frozen', ySplit: 1 }] })
  wsR.columns = [
    { header: 'S.No',             key: 'sno',           width: 5  },
    { header: 'Vehicle No',       key: 'vehicle_no',    width: 16 },
    { header: 'Purpose',          key: 'purpose',       width: 11 },
    { header: 'Shipment No',      key: 'shipment_no',   width: 16 },
    { header: 'Dock No',          key: 'dock_no',       width: 9  },
    { header: 'Rejection Reason', key: 'reason',        width: 35 },
    { header: 'Status',           key: 'status',        width: 14 },
    { header: 'Raised By\n(Supervisor)', key: 'raised_by', width: 18 },
    { header: 'Raised At',        key: 'raised_at',     width: 20 },
    { header: 'Decision By\n(OM/Admin)', key: 'decided_by', width: 18 },
    { header: 'Decided At',       key: 'decided_at',    width: 20 },
    { header: 'Resolved At',      key: 'resolved_at',   width: 20 },
    { header: 'Photo',            key: 'photo',         width: 10 },
  ]
  styleHeader(wsR)

  const allRej = db.prepare(`
    SELECT r.*, v.vehicle_no, v.shipment_no, v.purpose, d.dock_no,
           u1.name AS raised_by_name, u2.name AS decided_by_name
    FROM rejections r
    LEFT JOIN vehicles v ON v.id = r.vehicle_id
    LEFT JOIN docks d    ON d.id = r.dock_id
    LEFT JOIN users u1   ON u1.id = r.supervisor_id
    LEFT JOIN users u2   ON u2.id = r.decided_by
    ORDER BY r.created_at DESC LIMIT 2000
  `).all()

  const REJ_STATUS_FILL = { pending: 'FFFFF3CD', approved: 'FFFDE8D8', resolved: 'FFD1FAE5', denied: 'FFE5E7EB' }

  allRej.forEach((r, idx) => {
    const row = wsR.addRow({
      sno:        idx + 1,
      vehicle_no: r.vehicle_no || '',
      purpose:    (r.purpose || 'inbound') === 'outbound' ? 'OUTBOUND' : 'INBOUND',
      shipment_no: r.shipment_no || '',
      dock_no:    r.dock_no || '',
      reason:     r.reason,
      status:     r.status.toUpperCase(),
      raised_by:  r.raised_by_name || '',
      raised_at:  fmt(r.created_at),
      decided_by: r.decided_by_name || '',
      decided_at: fmt(r.decided_at),
      resolved_at: fmt(r.resolved_at),
      photo:      '',
    })
    styleData(row, idx % 2 === 1)
    const sc = row.getCell('status')
    sc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REJ_STATUS_FILL[r.status] || 'FFFFFFFF' } }
    sc.font = { bold: true, size: 10 }
    if (r.photo) addLink(row, 'photo', r.photo, baseUrl)
  })

  wsR.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: wsR.columns.length } }

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 3 — Summary
  // ══════════════════════════════════════════════════════════════════════════
  const wsS = wb.addWorksheet('Summary')
  wsS.columns = [{ width: 34 }, { width: 22 }]

  const tv  = vehicles.length
  const inb = vehicles.filter(v => (v.purpose || 'inbound') === 'inbound').length
  const out = vehicles.filter(v => v.purpose === 'outbound').length
  const dep = vehicles.filter(v => ['departed','rejected_departed'].includes(v.status)).length
  const off = vehicles.filter(v => v.status === 'offloaded').length
  const act = vehicles.filter(v => ['assigned','unloading'].includes(v.status)).length
  const wai = vehicles.filter(v => ['reported','waiting'].includes(v.status)).length
  const rej = vehicles.filter(v => v.status.includes('reject')).length

  const avgOf = (arr) => arr.length ? Math.round(arr.reduce((a,b) => a+b, 0) / arr.length) : '—'
  const tatArr = vehicles.filter(v => v.arrival_time && v.departed_time).map(v => diffMins(v.arrival_time, v.departed_time))
  const gateArr= vehicles.filter(v => v.gate_open_time && v.offload_time).map(v => diffMins(v.gate_open_time, v.offload_time))
  const waitArr= vehicles.filter(v => v.arrival_time && v.assigned_time).map(v => diffMins(v.arrival_time, v.assigned_time))

  const summaryRows = [
    ['REPORT SUMMARY', ''],
    ['Report Generated', new Date().toLocaleString('en-IN')],
    ['Date Filter', from && to ? `${from}  →  ${to}` : (date || 'All records')],
    ['', ''],
    ['VEHICLE COUNTS', ''],
    ['Total Vehicles', tv],
    ['  Inbound (Unloading)', inb],
    ['  Outbound (Loading)', out],
    ['', ''],
    ['CURRENT STATUS', ''],
    ['Departed (incl. rejected)', dep],
    ['Pending Departure (offloaded)', off],
    ['In Progress (gate open)', act],
    ['Waiting / On Hold', wai],
    ['Rejected (any status)', rej],
    ['', ''],
    ['TURNAROUND TIMES', ''],
    ['Avg. Wait at Gate → Dock Assigned (min)', avgOf(waitArr)],
    ['Avg. Gate Open → Dock Close (min)', avgOf(gateArr)],
    ['Avg. Total TAT — Arrival to Departure (min)', avgOf(tatArr)],
    ['', ''],
    ['REJECTION SUMMARY', ''],
    ['Total Rejections', allRej.length],
    ['  Pending', allRej.filter(r => r.status === 'pending').length],
    ['  Approved / On Hold', allRej.filter(r => r.status === 'approved').length],
    ['  Resolved', allRej.filter(r => r.status === 'resolved').length],
    ['  Denied', allRej.filter(r => r.status === 'denied').length],
  ]

  summaryRows.forEach(([label, value]) => {
    const r = wsS.addRow([label, value])
    r.getCell(1).alignment = { vertical: 'middle' }
    r.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' }
    r.getCell(2).font = { bold: true }

    if (!label) return
    if (['REPORT SUMMARY','VEHICLE COUNTS','CURRENT STATUS','TURNAROUND TIMES','REJECTION SUMMARY'].includes(label)) {
      r.height = 24
      r.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
      })
    } else if (label.startsWith('  ')) {
      r.getCell(1).font = { color: { argb: 'FF555555' } }
    } else {
      r.getCell(1).font = { bold: true }
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F4FF' } }
    }
  })

  // ── Send ──────────────────────────────────────────────────────────────────
  const filename = `vehicles_${date || (from && to ? `${from}_${to}` : 'all')}_${Date.now()}.xlsx`
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  await wb.xlsx.write(res)
  res.end()
})

// ── User list export ──────────────────────────────────────────────────────────
router.get('/users', managerOrAdmin, async (req, res) => {
  let users = db.prepare(`
    SELECT u.id, u.username, u.name, u.role, u.password_plain, u.active, u.created_at,
           d.dock_no as assigned_dock_no
    FROM users u LEFT JOIN docks d ON u.dock_id = d.id
    ORDER BY u.role, u.name
  `).all()

  if (req.user.role !== 'admin') {
    users = users.filter(u => ['security', 'dock_supervisor'].includes(u.role))
  }

  const ROLE_LBL = {
    admin: 'Admin', security: 'Security',
    dock_supervisor: 'Dock Supervisor', operation_manager: 'Operation Manager',
  }

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Users')

  ws.columns = [
    { header: 'S.No',     key: 'sno',      width: 6  },
    { header: 'Name',     key: 'name',     width: 24 },
    { header: 'Username', key: 'username', width: 20 },
    { header: 'Password', key: 'password', width: 20 },
    { header: 'Role',     key: 'role',     width: 22 },
    { header: 'Dock',     key: 'dock',     width: 12 },
    { header: 'Status',   key: 'status',   width: 12 },
  ]

  styleHeader(ws)

  users.forEach((u, idx) => {
    const row = ws.addRow({
      sno:      idx + 1,
      name:     u.name,
      username: u.username,
      password: u.password_plain || '(not set)',
      role:     ROLE_LBL[u.role] || u.role,
      dock:     u.assigned_dock_no || '—',
      status:   u.active ? 'Active' : 'Inactive',
    })
    styleData(row, idx % 2 === 1)
    const sc = row.getCell('status')
    sc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: u.active ? 'FFD1FAE5' : 'FFFEE2E2' } }
    sc.font = { bold: true, color: { argb: u.active ? 'FF065F46' : 'FF991B1B' } }
  })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="users_${Date.now()}.xlsx"`)
  await wb.xlsx.write(res)
  res.end()
})

module.exports = router
