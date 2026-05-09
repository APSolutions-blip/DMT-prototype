import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/auth/login', { username, password })
      login(data.token, data.user)
      navigate(data.user.role === 'admin' ? '/admin' : '/security', { replace: true })
    } catch {
      setError('Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-7xl mb-3">🚛</div>
          <h1 className="text-3xl font-black text-gray-800">DMT</h1>
          <p className="text-gray-400 mt-1 text-sm">Dock Management Tool</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-2xl px-4 py-4 text-lg focus:border-blue-500 outline-none transition"
              placeholder="Enter username"
              autoComplete="username"
              autoCapitalize="none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-600 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-2xl px-4 py-4 text-lg focus:border-blue-500 outline-none transition"
              placeholder="Enter password"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-2xl text-sm font-medium text-center">
              ❌ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-4 rounded-2xl text-lg transition disabled:opacity-40 disabled:cursor-not-allowed mt-2"
          >
            {loading ? '⏳ Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-gray-100 text-center">
          <p className="text-[11px] text-gray-300 tracking-wide uppercase font-semibold">Designed &amp; Developed by</p>
          <p className="text-sm font-black text-gray-500 mt-0.5 tracking-wider">Puneet Sharma</p>
        </div>
      </div>
    </div>
  )
}
