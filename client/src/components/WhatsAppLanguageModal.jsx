const LANGS = [
  { code: 'en', label: 'English',   flag: '🇬🇧',
    tpl: (v, d) => `Your vehicle *${v}* has been assigned to *Dock ${d}*. Please proceed to the dock immediately.` },
  { code: 'hi', label: 'हिंदी',     flag: '🇮🇳',
    tpl: (v, d) => `आपके वाहन *${v}* को *डॉक ${d}* आवंटित किया गया है। कृपया तुरंत डॉक पर पहुँचें।` },
  { code: 'mr', label: 'मराठी',     flag: '🇮🇳',
    tpl: (v, d) => `तुमच्या वाहनाला *${v}* *डॉक ${d}* देण्यात आले आहे. कृपया तात्काळ डॉकवर या.` },
  { code: 'gu', label: 'ગુજરાતી',   flag: '🇮🇳',
    tpl: (v, d) => `તમારા વાહન *${v}* ને *ડોક ${d}* સોંપવામાં આવ્યું છે. કૃપા કરી તરત જ ડોક પર પહોંચો.` },
  { code: 'ta', label: 'தமிழ்',     flag: '🇮🇳',
    tpl: (v, d) => `உங்கள் வாகனம் *${v}* க்கு *டாக் ${d}* ஒதுக்கப்பட்டுள்ளது. உடனே டாக்கிற்கு வாருங்கள்.` },
  { code: 'te', label: 'తెలుగు',    flag: '🇮🇳',
    tpl: (v, d) => `మీ వాహనం *${v}* కు *డాక్ ${d}* కేటాయించబడింది. దయచేసి వెంటనే డాక్‌కు చేరుకోండి.` },
  { code: 'kn', label: 'ಕನ್ನಡ',     flag: '🇮🇳',
    tpl: (v, d) => `ನಿಮ್ಮ ವಾಹನ *${v}* ಕ್ಕೆ *ಡಾಕ್ ${d}* ನಿಯೋಜಿಸಲಾಗಿದೆ. ದಯವಿಟ್ಟು ತಕ್ಷಣ ಡಾಕ್‌ಗೆ ಬನ್ನಿ.` },
  { code: 'pa', label: 'ਪੰਜਾਬੀ',    flag: '🇮🇳',
    tpl: (v, d) => `ਤੁਹਾਡੇ ਵਾਹਨ *${v}* ਨੂੰ *ਡੌਕ ${d}* ਦਿੱਤਾ ਗਿਆ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਤੁਰੰਤ ਡੌਕ ਤੇ ਆਓ।` },
  { code: 'bn', label: 'বাংলা',     flag: '🇮🇳',
    tpl: (v, d) => `আপনার গাড়ি *${v}* *ডক ${d}* এ বরাদ্দ করা হয়েছে। দয়া করে অবিলম্বে ডকে আসুন।` },
]

function buildLink(mobile, vehicleNo, dockNo, langCode) {
  const digits = (mobile || '').replace(/\D/g, '')
  const phone = digits.length === 10 ? '91' + digits : digits
  const lang = LANGS.find(l => l.code === langCode) || LANGS[0]
  const msg = lang.tpl(vehicleNo, dockNo)
  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
}

export default function WhatsAppLanguageModal({ vehicle, onClose }) {
  if (!vehicle) return null
  const lastUsed = localStorage.getItem('wa_lang') || 'en'
  const sortedLangs = [
    ...LANGS.filter(l => l.code === lastUsed),
    ...LANGS.filter(l => l.code !== lastUsed),
  ]

  const open = (code) => {
    localStorage.setItem('wa_lang', code)
    const url = buildLink(vehicle.driver_mobile, vehicle.vehicle_no, vehicle.dock_no, code)
    window.open(url, '_blank', 'noopener,noreferrer')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="bg-green-500 px-5 py-4 flex items-center justify-between rounded-t-3xl">
          <div>
            <div className="text-white text-lg font-black">📲 Send WhatsApp</div>
            <div className="text-white/80 text-xs">{vehicle.vehicle_no} → {vehicle.dock_no || 'dock'}</div>
          </div>
          <button onClick={onClose} className="text-white/80 text-4xl w-12 h-12 flex items-center justify-center">×</button>
        </div>
        <div className="p-4">
          <p className="text-xs font-bold text-gray-500 mb-3">CHOOSE LANGUAGE</p>
          <div className="space-y-2">
            {sortedLangs.map(l => (
              <button key={l.code} onClick={() => open(l.code)}
                className="w-full flex items-center gap-3 bg-gray-50 hover:bg-green-50 border-2 border-gray-100 hover:border-green-300 rounded-2xl px-4 py-3 text-left transition">
                <span className="text-2xl">{l.flag}</span>
                <span className="font-bold text-gray-800 flex-1">{l.label}</span>
                {l.code === lastUsed && <span className="text-[10px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">LAST USED</span>}
                <span className="text-green-600 text-xl">›</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
