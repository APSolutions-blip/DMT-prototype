import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../api'
import socket from '../socket'
import DockGrid from '../components/DockGrid'
import WaitingQueue from '../components/WaitingQueue'
import DockMaster from '../components/admin/DockMaster'
import UserMaster from '../components/admin/UserMaster'
import VehicleLog from '../components/admin/VehicleLog'
import AdminDockModal from '../components/admin/AdminDockModal'
import PerformancePanel from '../components/PerformancePanel'
const TOP_TABS = [
  { id: 'overview',   label: '📊 Overview' },
  { id: 'master',     label: '⚙️ Master' },
]

export default function AdminDashboard() {
  const { user, logout } = useAuth()
  const [tab, setTab] = useState('overview')
  const [masterTab, setMasterTab] = useState('docks')
  const [docks, setDocks] = useState([])
  const [queue, setQueue] = useState([])
  const [active, setActive] = useState([])
  const [selectedDock, setSelectedDock] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const [d, q, v] = await Promise.all([
        api.get('/docks'), api.get('/vehicles/queue'), api.get('/vehicles/active')
      ])
      setDocks(d.data); setQueue(q.data); setActive(v.data)
    } catch {}
  }, [])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    socket.on('data_changed', refresh)
    return () => socket.off('data_changed', refresh)
  }, [refresh])

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-purple-800 text-white px-4 py-3 flex items-center justify-between shadow-md flex-shrink-0">
        <div>
          <h1 className="text-lg font-black">🔧 Admin</h1>
          <p className="text-purple-300 text-xs">{user.name}</p>
        </div>
        <button onClick={logout} className="bg-purple-900 px-3 py-2 rounded-xl text-sm font-semibold">Logout</button>
      </header>

      {/* Top tabs */}
      <div className="flex bg-white border-b overflow-x-auto flex-shrink-0">
        {TOP_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-shrink-0 px-3 py-3 text-xs font-bold whitespace-nowrap transition ${tab===t.id ? 'text-purple-700' : 'text-gray-400'}`}
            style={tab===t.id ? { borderBottom: '3px solid #7e22ce' } : {}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <>
          {/* Stats */}
          <div className="bg-white px-4 py-2.5 grid grid-cols-4 gap-1 shadow text-center flex-shrink-0">
            <div><div className="text-xl font-black text-green-600">{docks.filter(d=>d.status==='green').length}</div><div className="text-xs text-gray-400">Free</div></div>
            <div><div className="text-xl font-black text-orange-500">{docks.filter(d=>d.status==='orange').length}</div><div className="text-xs text-gray-400">Assigned</div></div>
            <div><div className="text-xl font-black text-red-500">{docks.filter(d=>d.status==='red').length}</div><div className="text-xs text-gray-400">Unloading</div></div>
            <div><div className="text-xl font-black text-amber-500">{queue.length}</div><div className="text-xs text-gray-400">Queue</div></div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="bg-white rounded-3xl shadow p-4">
              <h2 className="font-black text-gray-700 mb-3">Live Dock Status <span className="text-sm font-normal text-gray-400">(tap to override)</span></h2>
              <DockGrid docks={docks} onDockClick={setSelectedDock} />
            </div>
            {queue.length > 0 && (
              <div className="bg-white rounded-3xl shadow p-4">
                <h2 className="font-black text-gray-700 mb-3">Waiting Queue</h2>
                <WaitingQueue queue={queue} docks={docks} />
              </div>
            )}
            <PerformancePanel />
          </div>
        </>
      )}

      {/* Master settings */}
      {tab === 'master' && (
        <div className="flex-1 overflow-y-auto">
          <div className="flex bg-white border-b">
            {[
              { id: 'docks', label: '🏭 Docks' },
              { id: 'users', label: '👥 Users' },
              { id: 'log',   label: '📋 Log' },
            ].map(t => (
              <button key={t.id} onClick={() => setMasterTab(t.id)}
                className={`flex-1 py-3 text-sm font-bold transition ${masterTab===t.id ? 'text-purple-700' : 'text-gray-400'}`}
                style={masterTab===t.id ? { borderBottom: '3px solid #7e22ce' } : {}}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="p-4">
            {masterTab === 'docks' && <DockMaster onRefresh={refresh} />}
            {masterTab === 'users' && <UserMaster />}
            {masterTab === 'log' && <VehicleLog maxHours={null} />}
          </div>
        </div>
      )}

      {selectedDock && (
        <AdminDockModal
          dock={selectedDock}
          vehicle={active.find(v => v.assigned_dock_id === selectedDock.id)}
          allDocks={docks}
          queuedVehicles={queue}
          onClose={() => setSelectedDock(null)}
          onAction={() => { refresh(); setSelectedDock(null) }}
        />
      )}
    </div>
  )
}
