// src/app/(dashboard)/kitchen/page.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { io, type Socket } from 'socket.io-client'

interface OrderItem { name: string; quantity: number; notes?: string; emoji?: string }
interface LiveOrder {
  id: string; orderNumber: number; tableNumber: number; tableLabel?: string
  status: string; total: number | string; items: OrderItem[]
  notes?: string; placedAt: string; acceptedAt?: string; preparingAt?: string
  elapsed?: number
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#4F9EFF', ACCEPTED: '#F59E0B', PREPARING: '#F59E0B', READY: '#22c55e',
}
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'New', ACCEPTED: 'Accepted', PREPARING: 'Preparing', READY: 'Ready',
}
const NEXT_STATUS: Record<string, string> = {
  PENDING: 'ACCEPTED', ACCEPTED: 'PREPARING', PREPARING: 'READY',
}
const NEXT_LABEL: Record<string, string> = {
  PENDING: 'Accept', ACCEPTED: 'Start Cooking', PREPARING: 'Mark Ready',
}

function useOrderTimer(placedAt: string) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = new Date(placedAt).getTime()
    const update = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [placedAt])
  return elapsed
}

function formatElapsed(s: number) {
  const m = Math.floor(s / 60), sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function KitchenTicket({ order, onUpdate }: { order: LiveOrder; onUpdate: (id: string, status: string) => void }) {
  const elapsed = useOrderTimer(order.placedAt)
  const isOverdue = elapsed > 15 * 60 // 15 min
  const nextStatus = NEXT_STATUS[order.status]

  return (
    <div style={{
      background: '#0e0e1a', border: `1px solid ${isOverdue ? 'rgba(232,32,42,0.4)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      boxShadow: isOverdue ? '0 0 20px rgba(232,32,42,0.1)' : 'none', transition: 'box-shadow 0.3s',
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', borderLeft: `3px solid ${STATUS_COLORS[order.status] ?? '#4F9EFF'}` }}>
        <div>
          <div style={{ fontWeight: '700', fontSize: '0.95rem', letterSpacing: '-0.02em' }}>Table {order.tableNumber}</div>
          <div style={{ fontSize: '0.65rem', color: 'rgba(240,240,248,0.4)', fontFamily: 'monospace' }}>#{order.orderNumber}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1rem', fontWeight: '700', color: isOverdue ? '#f87171' : elapsed > 10*60 ? '#fbbf24' : '#4ade80', fontFamily: 'monospace' }}>
            {formatElapsed(elapsed)}
          </div>
          <div style={{ fontSize: '0.62rem', color: 'rgba(240,240,248,0.35)' }}>{isOverdue ? '⚠️ OVERDUE' : 'elapsed'}</div>
        </div>
      </div>

      {/* Status badge */}
      <div style={{ padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.68rem', padding: '3px 10px', borderRadius: '100px', fontWeight: '700', letterSpacing: '0.04em', textTransform: 'uppercase', background: `${STATUS_COLORS[order.status]}20`, color: STATUS_COLORS[order.status], border: `1px solid ${STATUS_COLORS[order.status]}40` }}>
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#E8202A', fontFamily: 'monospace' }}>
          {typeof order.total === 'number' ? order.total.toFixed(3) : order.total} JOD
        </span>
      </div>

      {/* Items */}
      <div style={{ padding: '8px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {order.items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <span style={{ fontWeight: '800', fontSize: '0.88rem', color: '#F0F0F8', minWidth: '22px', fontFamily: 'monospace' }}>×{item.quantity}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.82rem', color: 'rgba(240,240,248,0.85)', fontWeight: '500' }}>{item.emoji} {item.name}</div>
              {item.notes && <div style={{ fontSize: '0.7rem', color: '#fbbf24', marginTop: '2px' }}>📝 {item.notes}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Special instructions */}
      {order.notes && (
        <div style={{ margin: '0 16px', padding: '8px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', fontSize: '0.75rem', color: '#fbbf24' }}>
          📝 {order.notes}
        </div>
      )}

      {/* Action */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '10px' }}>
        {order.status === 'READY' ? (
          <div style={{ textAlign: 'center', fontSize: '0.8rem', fontWeight: '600', color: '#4ade80' }}>✅ Ready — Waiter notified</div>
        ) : nextStatus ? (
          <button
            onClick={() => onUpdate(order.id, nextStatus)}
            style={{ width: '100%', padding: '9px', borderRadius: '9px', border: 'none', fontWeight: '700', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s', background: order.status === 'PENDING' ? 'rgba(79,158,255,0.15)' : order.status === 'ACCEPTED' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)', color: order.status === 'PENDING' ? '#7dd3fc' : order.status === 'ACCEPTED' ? '#fbbf24' : '#4ade80', letterSpacing: '-0.01em' }}
            onMouseOver={e => (e.currentTarget.style.filter = 'brightness(1.2)')}
            onMouseOut={e => (e.currentTarget.style.filter = 'brightness(1)')}
          >
            {NEXT_LABEL[order.status]} →
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default function KitchenPage() {
  const [orders, setOrders] = useState<LiveOrder[]>([])
  const [filter, setFilter] = useState<string>('active')
  const [connected, setConnected] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const socketRef = useRef<Socket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // Beep sound using Web Audio API
  const playBeep = useCallback(() => {
    if (!soundEnabled) return
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
      const ctx = audioCtxRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.start(); osc.stop(ctx.currentTime + 0.4)
    } catch { /* Web Audio not supported */ }
  }, [soundEnabled])

  // Load initial orders
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/orders?status=PENDING', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          setOrders(data.orders ?? [])
        }
      } catch { /* handled */ }
    }
    load()
  }, [])

  // Socket.io
  useEffect(() => {
    const token = document.cookie.match(/tt_access=([^;]+)/)?.[1]
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? '', {
      path: '/api/socket',
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
    })
    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    socket.on('order:new', (order: LiveOrder) => {
      setOrders(prev => [order, ...prev])
      playBeep()
    })

    socket.on('order:status', (update: { id: string; status: string }) => {
      setOrders(prev => prev.map(o => o.id === update.id ? { ...o, status: update.status } : o))
    })

    return () => { socket.disconnect() }
  }, [playBeep])

  async function updateStatus(orderId: string, newStatus: string) {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: data.order.status } : o))
      }
    } catch { /* handled */ }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    window.location.href = '/auth/login'
  }

  const filtered = orders.filter(o => {
    if (filter === 'active') return ['PENDING', 'ACCEPTED', 'PREPARING'].includes(o.status)
    if (filter === 'ready') return o.status === 'READY'
    return true
  })

  const counts = {
    pending: orders.filter(o => o.status === 'PENDING').length,
    preparing: orders.filter(o => ['ACCEPTED', 'PREPARING'].includes(o.status)).length,
    ready: orders.filter(o => o.status === 'READY').length,
  }

  const S: React.CSSProperties = { fontFamily: 'Geist,system-ui,sans-serif', background: '#04040A', color: '#F0F0F8', minHeight: '100vh', display: 'flex', flexDirection: 'column' }

  return (
    <div style={S}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#08080F', gap: '12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', fontSize: '0.95rem', letterSpacing: '-0.03em' }}>
          <span style={{ fontSize: '1.1rem' }}>🍔</span> Kitchen Display
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', padding: '4px 11px', borderRadius: '100px', background: connected ? 'rgba(34,197,94,0.1)' : 'rgba(232,32,42,0.1)', border: `1px solid ${connected ? 'rgba(34,197,94,0.25)' : 'rgba(232,32,42,0.25)'}`, color: connected ? '#22c55e' : '#f87171' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: connected ? '#22c55e' : '#f87171', display: 'inline-block', animation: connected ? 'pulse 2s infinite' : 'none' }}/>
          {connected ? 'Live' : 'Reconnecting…'}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button onClick={() => setSoundEnabled(s => !s)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(240,240,248,0.5)', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit' }}>
            {soundEnabled ? '🔔 Sound On' : '🔕 Sound Off'}
          </button>
          <button onClick={logout} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(240,240,248,0.4)', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit' }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1px', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {[
          { label: 'New Orders', val: counts.pending, color: '#4F9EFF' },
          { label: 'Preparing', val: counts.preparing, color: '#F59E0B' },
          { label: 'Ready', val: counts.ready, color: '#22c55e' },
        ].map(k => (
          <div key={k.label} style={{ padding: '14px 20px', background: '#08080F', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: '700', fontFamily: 'monospace', color: k.color, letterSpacing: '-0.04em', lineHeight: 1 }}>{k.val}</div>
            <div style={{ fontSize: '0.68rem', color: 'rgba(240,240,248,0.35)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '6px', padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#08080F', flexShrink: 0 }}>
        {[['active','🔥 Active'], ['ready','✅ Ready'], ['all','All']].map(([f, l]) => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: '8px', border: `1px solid ${filter===f ? '#E8202A' : 'rgba(255,255,255,0.08)'}`, background: filter===f ? 'rgba(232,32,42,0.12)' : 'transparent', color: filter===f ? '#E8202A' : 'rgba(240,240,248,0.5)', fontSize: '0.78rem', fontWeight: filter===f?'600':'400', cursor: 'pointer', fontFamily: 'inherit' }}>
            {l}
          </button>
        ))}
      </div>

      {/* Tickets grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'rgba(240,240,248,0.25)', fontSize: '0.88rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✅</div>
            No {filter === 'active' ? 'active' : filter === 'ready' ? 'ready' : ''} orders
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '12px' }}>
            {filtered.map(order => (
              <KitchenTicket key={order.id} order={order} onUpdate={updateStatus} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
