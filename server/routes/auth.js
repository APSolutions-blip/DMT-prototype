const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const db = require('../db')
const { JWT_SECRET } = require('../middleware/auth')
const { rateLimit } = require('../middleware/rateLimit')

const loginLimiter = rateLimit({ windowMs: 60_000, max: 10, keyPrefix: 'login' })

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username)

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' })
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, name: user.name, dock_id: user.dock_id || null },
    JWT_SECRET,
    { expiresIn: '12h' }
  )

  const userData = { id: user.id, username: user.username, role: user.role, name: user.name, dock_id: user.dock_id || null }
  res.json({ token, user: userData })
})

module.exports = router
