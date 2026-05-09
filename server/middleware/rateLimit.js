// Tiny in-memory rate limiter — enough for a single-node local app.
// Not cluster-safe. Good enough to stop brute-force password guessing.
function rateLimit({ windowMs, max, keyPrefix = 'default' }) {
  const hits = new Map()  // key -> [timestamp, ...]
  setInterval(() => {
    const cutoff = Date.now() - windowMs
    for (const [k, arr] of hits) {
      const pruned = arr.filter(t => t > cutoff)
      if (pruned.length === 0) hits.delete(k)
      else hits.set(k, pruned)
    }
  }, windowMs).unref?.()

  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown'
    const key = `${keyPrefix}:${ip}`
    const now = Date.now()
    const cutoff = now - windowMs
    const arr = (hits.get(key) || []).filter(t => t > cutoff)
    if (arr.length >= max) {
      const retryAfter = Math.ceil((arr[0] + windowMs - now) / 1000)
      res.set('Retry-After', String(retryAfter))
      return res.status(429).json({ error: `Too many attempts. Retry in ${retryAfter}s.` })
    }
    arr.push(now)
    hits.set(key, arr)
    next()
  }
}

module.exports = { rateLimit }
