import { useState, useRef } from 'react'
import api from '../api'

// kind: 'docks' | 'users'
export default function BulkImport({ kind, accent = 'purple', onDone }) {
  const [uploading, setUploading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [result, setResult] = useState(null)
  const fileInput = useRef(null)

  const label = kind === 'docks' ? 'Docks' : 'Users'

  const accentBtn = accent === 'indigo'
    ? 'bg-indigo-600 hover:bg-indigo-700'
    : 'bg-purple-600 hover:bg-purple-700'

  const downloadTemplate = async () => {
    setDownloading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/bulk/template/${kind}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `${kind}_template.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { alert('Download failed') }
    finally { setDownloading(false) }
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post(`/bulk/upload/${kind}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setResult(data)
      if (data.created > 0 && onDone) onDone()
    } catch (err) {
      setResult({ created: 0, skipped: 0, errors: [{ row: '-', error: err.response?.data?.error || 'Upload failed' }] })
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-500">📥 BULK IMPORT {label.toUpperCase()}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={downloadTemplate} disabled={downloading}
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-3 py-2.5 rounded-xl text-xs transition disabled:opacity-40">
          {downloading ? '⏳ Preparing…' : '📄 Download Sample'}
        </button>
        <button onClick={() => fileInput.current?.click()} disabled={uploading}
          className={`${accentBtn} text-white font-bold px-3 py-2.5 rounded-xl text-xs transition disabled:opacity-40`}>
          {uploading ? '⏳ Uploading…' : '⬆️ Upload Filled Excel'}
        </button>
        <input ref={fileInput} type="file" accept=".xlsx" onChange={onFile} className="hidden" />
      </div>

      {result && (
        <div className={`rounded-xl p-3 border-2 ${result.created > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-gray-800">
              {result.created > 0 ? '✅' : '⚠️'} Imported {result.created} {label.toLowerCase()}
              {result.skipped > 0 && ` · ${result.skipped} skipped`}
              {result.errors?.length > 0 && ` · ${result.errors.length} issues`}
            </div>
            <button onClick={() => setResult(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          </div>
          {result.errors?.length > 0 && (
            <ul className="mt-2 space-y-0.5 max-h-40 overflow-y-auto text-xs text-red-700">
              {result.errors.map((e, i) => (
                <li key={i}>• Row {e.row}: {e.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
