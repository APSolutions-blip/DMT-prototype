const fs = require('fs')
const path = require('path')

const LOGS_DIR = path.join(__dirname, 'logs')
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true })

function getLogFile() {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return path.join(LOGS_DIR, `${date}.log`)
}

function write(level, message) {
  const ts = new Date().toLocaleString('en-IN', { hour12: false })
  const line = `[${ts}] [${level}] ${message}\n`
  process.stdout.write(line)
  fs.appendFileSync(getLogFile(), line)
}

const logger = {
  info:  (msg) => write('INFO ', msg),
  warn:  (msg) => write('WARN ', msg),
  error: (msg) => write('ERROR', msg),
  LOGS_DIR
}

// Capture unhandled errors to log file
process.on('uncaughtException', (err) => {
  write('ERROR', `Uncaught: ${err.message}\n${err.stack}`)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  write('ERROR', `Unhandled rejection: ${reason}`)
})

module.exports = logger
