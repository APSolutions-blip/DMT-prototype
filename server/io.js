let io = null

module.exports = {
  setIo(instance) { io = instance },
  emit(event, data) { if (io) io.emit(event, data) }
}
