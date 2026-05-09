export const STATUS = {
  reported:          { label: 'Reported',           color: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-300'  },
  waiting:           { label: 'Queue Waiting',       color: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-300' },
  assigned:          { label: 'Dock Assigned',       color: 'bg-orange-500',  text: 'text-orange-700',  bg: 'bg-orange-50',  border: 'border-orange-300'},
  unloading:         { label: 'In Progress',         color: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-300'   },
  offloaded:         { label: 'Completed',           color: 'bg-green-500',   text: 'text-green-700',   bg: 'bg-green-50',   border: 'border-green-300' },
  departed:          { label: 'Departed',            color: 'bg-gray-400',    text: 'text-gray-600',    bg: 'bg-gray-50',    border: 'border-gray-200'  },
  rejection_pending: { label: 'Rejection Pending',   color: 'bg-rose-500',    text: 'text-rose-700',    bg: 'bg-rose-50',    border: 'border-rose-300'  },
  rejected_hold:     { label: 'Rejected — On Hold',  color: 'bg-red-700',     text: 'text-red-800',     bg: 'bg-red-50',     border: 'border-red-400'   },
  rejected_departed: { label: 'Rejected Departed',   color: 'bg-gray-500',    text: 'text-gray-600',    bg: 'bg-gray-50',    border: 'border-gray-300'  },
}

export const PURPOSE_LABEL = {
  inbound:  { label: 'Unloading', short: 'IN',  color: 'bg-sky-100 text-sky-700'    },
  outbound: { label: 'Loading',   short: 'OUT', color: 'bg-amber-100 text-amber-700' },
}

export const ROLE_LABELS = {
  admin:             '🔧 Admin',
  security:          '🔒 Security',
  dock_supervisor:   '🏭 Dock Supervisor',
  operation_manager: '📊 Operation Manager',
}

export function elapsed(ts) {
  if (!ts) return ''
  const mins = Math.round((Date.now() - new Date(ts)) / 60000)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`
}

export function elapsedTimer(ts) {
  if (!ts) return null
  const mins = Math.floor((Date.now() - new Date(ts)) / 60000)
  if (mins < 1) return '< 1 min'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function duration(from, to) {
  if (!from || !to) return null
  const mins = Math.round((new Date(to) - new Date(from)) / 60000)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}
