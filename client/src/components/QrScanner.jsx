import { useEffect, useRef, useState } from 'react'

export default function QrScanner({ onScan, onClose }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const intervalRef = useRef(null)
  const [error, setError] = useState('')
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    startCamera()
    return () => cleanup()
  }, [])

  const cleanup = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
  }

  const startCamera = async () => {
    if (!('BarcodeDetector' in window)) {
      setError('QR scanning not supported on this browser.\nUse Chrome on Android or enter manually.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setScanning(true)
        startDetection()
      }
    } catch (e) {
      setError('Camera access denied.\nPlease allow camera permission and try again.')
    }
  }

  const startDetection = () => {
    const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'ean_13'] })
    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return
      try {
        const codes = await detector.detect(videoRef.current)
        if (codes.length > 0) {
          cleanup()
          onScan(codes[0].rawValue)
        }
      } catch {}
    }, 400)
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black">
        <span className="text-white font-bold text-lg">📷 Scan QR / Barcode</span>
        <button onClick={() => { cleanup(); onClose() }} className="text-white text-4xl w-12 h-12 flex items-center justify-center">×</button>
      </div>

      {error ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <p className="text-white text-center whitespace-pre-line">{error}</p>
            <button onClick={() => { cleanup(); onClose() }}
              className="mt-6 bg-white text-black font-bold px-6 py-3 rounded-2xl">
              Close & Enter Manually
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 relative">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          {/* scanning frame */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 relative">
              <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-green-400 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-green-400 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-green-400 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-green-400 rounded-br-lg" />
              {scanning && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-green-400 animate-bounce" style={{ animationDuration: '2s' }} />
              )}
            </div>
          </div>
          <p className="absolute bottom-8 left-0 right-0 text-center text-white/80 text-sm">
            Point camera at QR code or barcode
          </p>
        </div>
      )}
    </div>
  )
}
