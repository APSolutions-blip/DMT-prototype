import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useState, useEffect } from 'react'
import socket from './socket'
import Login from './pages/Login'
import ErrorBoundary from './components/ErrorBoundary'
import SecurityDashboard from './pages/SecurityDashboard'
import DockSupervisorDashboard from './pages/DockSupervisorDashboard'
import OperationManagerDashboard from './pages/OperationManagerDashboard'
import AdminDashboard from './pages/AdminDashboard'

// ── Server disconnect overlay ─────────────────────────────────────────────────
// A tiny visual-only "GIF" story: truck → breaks down → lightning → sleeping → repeat.
// No text — the animation tells the whole story.
const STORY = [
  '🚛💨', '🚛💨', '🚛💥', '🔧😰', '⚡🔌', '😵🌀', '💤💤', '🔄⏳',
]

function DisconnectOverlay() {
  const [disconnected, setDisconnected] = useState(!socket.connected)
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const onDisconnect = () => setDisconnected(true)
    const onConnect   = () => setDisconnected(false)
    socket.on('disconnect', onDisconnect)
    socket.on('connect', onConnect)
    return () => { socket.off('disconnect', onDisconnect); socket.off('connect', onConnect) }
  }, [])

  useEffect(() => {
    if (!disconnected) return
    const t = setInterval(() => setFrame(f => (f + 1) % STORY.length), 500)
    return () => clearInterval(t)
  }, [disconnected])

  if (!disconnected) return null

  return (
    <div className="fixed inset-0 z-[9999] bg-black/85 flex items-center justify-center p-6"
         style={{ backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-3xl shadow-2xl p-10 flex items-center justify-center">
        <span key={frame} className="text-7xl animate-bounce-in">{STORY[frame]}</span>
      </div>
      <style>{`
        @keyframes bounce-in {
          0%   { transform: scale(0.6) rotate(-10deg); opacity: 0; }
          60%  { transform: scale(1.15) rotate(5deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        .animate-bounce-in { animation: bounce-in 0.45s ease-out; display: inline-block; }
      `}</style>
    </div>
  )
}

// ── Role-based routing ────────────────────────────────────────────────────────
const ROLE_HOME = {
  admin:             '/admin',
  security:          '/security',
  dock_supervisor:   '/dock',
  operation_manager: '/operations',
}

function ProtectedRoute({ children, roles }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={ROLE_HOME[user.role] || '/login'} replace />
  return children
}

function RootRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={ROLE_HOME[user.role] || '/login'} replace />
}

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <BrowserRouter>
        <DisconnectOverlay />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RootRedirect />} />

          <Route path="/security" element={
            <ProtectedRoute roles={['security', 'admin']}>
              <SecurityDashboard />
            </ProtectedRoute>
          } />

          <Route path="/dock" element={
            <ProtectedRoute roles={['dock_supervisor', 'admin']}>
              <DockSupervisorDashboard />
            </ProtectedRoute>
          } />

          <Route path="/operations" element={
            <ProtectedRoute roles={['operation_manager', 'admin']}>
              <OperationManagerDashboard />
            </ProtectedRoute>
          } />

          <Route path="/admin/*" element={
            <ProtectedRoute roles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          } />

          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
  )
}
