const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
const { networkInterfaces } = require('os')

const log = require('./logger')
const db = require('./db')
const emitter = require('./io')

const app = express()
const server = http.createServer(app)
const io = new Server(server, { cors: { origin: '*' } })
emitter.setIo(io)

app.use(cors())
app.use(express.json({ limit: '1mb' }))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Request logger — logs every API call
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    const start = Date.now()
    res.on('finish', () => {
      log.info(`${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms)`)
    })
  }
  next()
})

app.use('/api/auth', require('./routes/auth'))
app.use('/api/vehicles', require('./routes/vehicles'))
app.use('/api/docks', require('./routes/docks'))
app.use('/api/users', require('./routes/users'))
app.use('/api/rejections', require('./routes/rejections'))
app.use('/api/export', require('./routes/export'))
app.use('/api/stats', require('./routes/stats'))
app.use('/api/bulk', require('./routes/bulk'))

// Global API error handler — log the real reason server-side, return a friendly
// message to clients (security/dock supervisors should not see raw stack traces).
app.use('/api', (err, req, res, next) => {
  if (res.headersSent) return next(err)
  const status = err.status || err.statusCode || 500
  log.error(`API ERROR ${req.method} ${req.path}: ${err.message}${err.stack ? '\n' + err.stack : ''}`)
  const msg = status >= 500
    ? 'Something went wrong. Please try again or contact your supervisor.'
    : (err.message || 'Request failed')
  res.status(status).json({ error: msg })
})

// Serve built React app
const clientBuild = path.join(__dirname, '../client/dist')
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild))
  app.get('*', (req, res) => res.sendFile(path.join(clientBuild, 'index.html')))
} else {
  app.get('/', (req, res) => res.send('Run "npm run setup" first to build the client.'))
}

io.on('connection', (socket) => {
  log.info(`Device connected: ${socket.id}`)
  socket.on('disconnect', () => log.info(`Device disconnected: ${socket.id}`))
})

const PORT = process.env.PORT || 3001
server.listen(PORT, '0.0.0.0', () => {
  const lines = [
    '========================================',
    '   DMT — DOCK MANAGEMENT TOOL - SERVER RUNNING',
    '========================================'
  ]

  const nets = networkInterfaces()
  for (const ifaces of Object.values(nets)) {
    for (const net of ifaces) {
      if (net.family === 'IPv4' && !net.internal) {
        lines.push(`\n   Open on ALL devices:\n   http://${net.address}:${PORT}`)
      }
    }
  }
  lines.push(`\n   Local (this PC):\n   http://localhost:${PORT}`)
  lines.push(`\n   Logs folder: ${log.LOGS_DIR}`)
  lines.push('\n   Default login: admin / admin123')
  lines.push('========================================\n')

  lines.forEach(l => log.info(l))
})
