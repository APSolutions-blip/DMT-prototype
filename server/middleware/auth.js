const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

// JWT_SECRET: prefer env var; else generate and persist one to data/.jwt-secret
// so tokens survive restarts without requiring manual setup.
function loadOrCreateSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) {
    return process.env.JWT_SECRET
  }
  const dataDir = path.join(__dirname, '..', 'data')
  const secretFile = path.join(dataDir, '.jwt-secret')
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
  if (fs.existsSync(secretFile)) {
    const s = fs.readFileSync(secretFile, 'utf8').trim()
    if (s.length >= 32) return s
  }
  const secret = crypto.randomBytes(48).toString('hex')
  fs.writeFileSync(secretFile, secret, { mode: 0o600 })
  console.log('  Generated new JWT secret at data/.jwt-secret')
  return secret
}
const JWT_SECRET = loadOrCreateSecret()

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'No token' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin access required' })
  next()
}

function managerOrAdmin(req, res, next) {
  if (!['admin', 'operation_manager'].includes(req.user?.role))
    return res.status(403).json({ error: 'Manager access required' })
  next()
}

module.exports = { authMiddleware, adminOnly, managerOrAdmin, JWT_SECRET }
