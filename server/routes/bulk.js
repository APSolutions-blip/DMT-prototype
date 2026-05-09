const router = require('express').Router()
const ExcelJS = require('exceljs')
const multer = require('multer')
const bcrypt = require('bcryptjs')
const db = require('../db')
const { authMiddleware, managerOrAdmin } = require('../middleware/auth')
const emitter = require('../io')
const log = require('../logger')

const VALID_ROLES = ['admin', 'security', 'dock_supervisor', 'operation_manager']

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xlsm)$/i.test(file.originalname)
    cb(ok ? null : new Error('Only .xlsx files allowed'), ok)
  },
})

router.use(authMiddleware, managerOrAdmin)

// ── Helpers ──────────────────────────────────────────────────────────────────
function styleHeader(ws, argb = 'FF4338CA') {
  const row = ws.getRow(1)
  row.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    c.alignment = { vertical: 'middle', horizontal: 'center' }
    c.border = { bottom: { style: 'medium', color: { argb: 'FFFFFFFF' } } }
  })
  row.height = 28
}

function styleInstructions(ws, rowNum) {
  const row = ws.getRow(rowNum)
  row.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } }
    c.font = { italic: true, color: { argb: 'FF666666' }, size: 10 }
  })
}

async function sendWorkbook(res, wb, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  await wb.xlsx.write(res)
  res.end()
}

// ── Template: Docks ─────────────────────────────────────────────────────────
router.get('/template/docks', async (req, res) => {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Docks')
  ws.columns = [
    { header: 'Dock No', key: 'dock_no', width: 20 },
    { header: 'Type',    key: 'type',    width: 14 },
  ]
  styleHeader(ws)
  ws.addRow({ dock_no: 'D-01', type: 'inbound' })
  ws.addRow({ dock_no: 'D-02', type: 'inbound' })
  ws.addRow({ dock_no: 'D-03', type: 'outbound' })
  ws.addRow([])
  ws.getCell('A6').value = 'Instructions:'
  ws.getCell('A6').font = { bold: true, color: { argb: 'FFD97706' } }
  ws.getRow(7).getCell(1).value = '1. Dock No is required and must be unique (e.g. D-01, LOAD-01)'
  ws.getRow(8).getCell(1).value = '2. Type: inbound (unloading) or outbound (loading). Defaults to inbound.'
  ws.getRow(9).getCell(1).value = '3. Delete these example rows and the instructions before uploading'
  await sendWorkbook(res, wb, 'docks_template.xlsx')
})

// ── Template: Users ─────────────────────────────────────────────────────────
router.get('/template/users', async (req, res) => {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Users')
  const isAdmin = req.user.role === 'admin'
  ws.columns = [
    { header: 'Name',     key: 'name',     width: 22 },
    { header: 'Username', key: 'username', width: 22 },
    { header: 'Password', key: 'password', width: 18 },
    { header: 'Role',     key: 'role',     width: 22 },
  ]
  styleHeader(ws)
  ws.addRow({ name: 'Ramesh Gupta', username: 'ramesh.security', password: 'pass123', role: 'security' })
  ws.addRow({ name: 'Sita Rao',     username: 'sita.dock',       password: 'pass123', role: 'dock_supervisor' })
  if (isAdmin) {
    ws.addRow({ name: 'Mohan Ops',  username: 'mohan.ops',       password: 'pass123', role: 'operation_manager' })
  }
  ws.addRow([])
  const infoStart = isAdmin ? 6 : 5
  ws.getCell(`A${infoStart}`).value = 'Instructions:'
  ws.getCell(`A${infoStart}`).font = { bold: true, color: { argb: 'FFD97706' } }
  ws.getRow(infoStart + 1).getCell(1).value = '1. Name, Username, Password, Role are required'
  ws.getRow(infoStart + 2).getCell(1).value = `2. Role must be one of: security, dock_supervisor${isAdmin ? ', operation_manager, admin' : ''}`
  ws.getRow(infoStart + 3).getCell(1).value = '3. Username must be unique. Dock assignment is done separately after creation.'
  ws.getRow(infoStart + 4).getCell(1).value = '4. Delete example rows and instructions before uploading'
  await sendWorkbook(res, wb, 'users_template.xlsx')
})

// ── Parse a worksheet into {headers, rows} ─────────────────────────────────
function parseSheet(ws) {
  const headers = []
  ws.getRow(1).eachCell((cell, colNum) => {
    headers[colNum - 1] = String(cell.value || '').trim().toLowerCase().replace(/\s+/g, '_')
  })
  const rows = []
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return
    const obj = {}
    let hasValue = false
    row.eachCell((cell, colNum) => {
      const key = headers[colNum - 1]
      if (!key) return
      let v = cell.value
      if (v && typeof v === 'object' && 'text' in v) v = v.text
      if (v != null) {
        obj[key] = String(v).trim()
        if (obj[key]) hasValue = true
      }
    })
    // skip instruction rows (single cell starting with a digit+".")
    const firstCell = Object.values(obj)[0] || ''
    const looksLikeInstruction = /^instructions?:?$/i.test(firstCell) || /^\d+\.\s/.test(firstCell)
    if (hasValue && !looksLikeInstruction) {
      rows.push({ ...obj, _rowNum: rowNum })
    }
  })
  return { headers, rows }
}

// ── Upload: Docks ───────────────────────────────────────────────────────────
router.post('/upload/docks', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(req.file.buffer)
    const ws = wb.worksheets[0]
    if (!ws) return res.status(400).json({ error: 'Workbook has no sheets' })

    const { rows } = parseSheet(ws)
    const results = { created: 0, skipped: 0, errors: [] }

    const insert = db.prepare(`INSERT INTO docks (dock_no, supervisor_name, supervisor_phone, type) VALUES (?,?,?,?)`)
    const exists = db.prepare(`SELECT id FROM docks WHERE dock_no = ?`)

    for (const r of rows) {
      const dockNo = (r.dock_no || '').toUpperCase()
      const supName  = r.supervisor_name || null
      const supPhone = r.supervisor_phone || null
      const typeRaw = String(r.type || 'inbound').toLowerCase()
      const type = ['inbound','outbound'].includes(typeRaw) ? typeRaw : 'inbound'
      if (!dockNo) {
        results.errors.push({ row: r._rowNum, error: 'Dock No is empty' })
        continue
      }
      if (exists.get(dockNo)) {
        results.skipped++
        results.errors.push({ row: r._rowNum, error: `Dock ${dockNo} already exists — skipped` })
        continue
      }
      try {
        insert.run(dockNo, supName, supPhone, type)
        results.created++
      } catch (e) {
        results.errors.push({ row: r._rowNum, error: e.message })
      }
    }

    if (results.created > 0) {
      emitter.emit('data_changed', { type: 'docks' })
      log.info(`BULK DOCKS: ${results.created} created, ${results.errors.length} errors by ${req.user.name}`)
    }
    res.json(results)
  } catch (e) {
    res.status(400).json({ error: `Failed to parse file: ${e.message}` })
  }
})

// ── Upload: Users ───────────────────────────────────────────────────────────
router.post('/upload/users', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  const isAdmin = req.user.role === 'admin'
  try {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(req.file.buffer)
    const ws = wb.worksheets[0]
    if (!ws) return res.status(400).json({ error: 'Workbook has no sheets' })

    const { rows } = parseSheet(ws)
    const results = { created: 0, skipped: 0, errors: [] }

    const userExists = db.prepare(`SELECT id FROM users WHERE username = ?`)
    const findDock   = db.prepare(`SELECT id FROM docks WHERE dock_no = ? AND active = 1`)
    const dockInUse  = db.prepare(`SELECT name FROM users WHERE dock_id = ?`)
    const insert     = db.prepare(`INSERT INTO users (username, password_hash, password_plain, name, role, dock_id) VALUES (?,?,?,?,?,?)`)

    for (const r of rows) {
      const name     = r.name || ''
      const username = (r.username || '').toLowerCase()
      const password = r.password || ''
      const role     = (r.role || '').toLowerCase()
      const dockNo   = (r.dock_no || '').toUpperCase()

      if (!name || !username || !password || !role) {
        results.errors.push({ row: r._rowNum, error: 'Missing required field (name, username, password, or role)' })
        continue
      }
      if (!VALID_ROLES.includes(role)) {
        results.errors.push({ row: r._rowNum, error: `Invalid role "${role}"` })
        continue
      }
      if (!isAdmin && !['security', 'dock_supervisor'].includes(role)) {
        results.errors.push({ row: r._rowNum, error: `Only admin can create ${role}` })
        continue
      }
      if (userExists.get(username)) {
        results.skipped++
        results.errors.push({ row: r._rowNum, error: `Username "${username}" already exists — skipped` })
        continue
      }

      let dockId = null
      if (role === 'dock_supervisor' && dockNo) {
        const d = findDock.get(dockNo)
        if (!d) {
          results.errors.push({ row: r._rowNum, error: `Dock "${dockNo}" not found` })
          continue
        }
        const conflict = dockInUse.get(d.id)
        if (conflict) {
          results.errors.push({ row: r._rowNum, error: `Dock ${dockNo} already assigned to ${conflict.name}` })
          continue
        }
        dockId = d.id
      }

      try {
        const hash = bcrypt.hashSync(password, 10)
        insert.run(username, hash, password, name, role, dockId)
        results.created++
      } catch (e) {
        results.errors.push({ row: r._rowNum, error: e.message })
      }
    }

    if (results.created > 0) {
      log.info(`BULK USERS: ${results.created} created, ${results.errors.length} errors by ${req.user.name}`)
    }
    res.json(results)
  } catch (e) {
    res.status(400).json({ error: `Failed to parse file: ${e.message}` })
  }
})

module.exports = router
