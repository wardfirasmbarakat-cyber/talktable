// src/app/(dashboard)/manager/page.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { io, type Socket } from 'socket.io-client'

// ─── Types ────────────────────────────────────────────────────────────────────
interface User { id: string; name: string; email: string; role: string }
interface Restaurant { id: string; name: string; slug: string }
interface OrderItem { name: string; quantity: number; notes?: string; emoji?: string }
interface Order {
  id: string; orderNumber: number; tableNumber: number; tableLabel?: string
  status: string; total: number | string; items: OrderItem[]
  notes?: string; placedAt: string; waiterRequested?: boolean
}
interface Table {
  id: string; number: number; label?: string; qrToken: string
  activeOrder?: Order | null; waiterRequested?: boolean
}
interface MenuItem {
  id: string; name: string; nameAr?: string; description?: string
  price: number; categoryId: string; categoryName?: string
  calories?: number; emoji?: string; imageUrl?: string
  isAvailable: boolean; isFeatured: boolean
}
interface Category { id: string; name: string; nameAr?: string; itemCount?: number }
interface KnowledgeItem {
  id: string; category: string; title: string; content: string; createdAt: string
}
interface Employee {
  id: string; name: string; email: string; role: string
  isActive: boolean; lastLoginAt?: string
}
interface InventoryItem {
  id: string; name: string; quantity: number; unit: string
  lowStockThreshold: number; status?: string
}
interface FeedbackItem {
  id: string; tableNumber: number; foodRating: number; serviceRating: number
  atmosphereRating: number; comment?: string; createdAt: string
}
interface Analytics {
  totalRevenue: number; totalOrders: number; avgOrderValue: number
  activeTables: number; pendingOrders: number; customerSatisfaction: number
  topItems?: { name: string; orders: number; revenue: number }[]
  peakHours?: { hour: number; orders: number }[]
  revenueByDay?: { label: string; revenue: number }[]
}
interface NotificationEvent {
  id: string; type: string; message: string; tableNumber?: number; timestamp: string
}

// ─── Constants ────────────────────────────────────────────────────────────────
const BG = '#04040A'
const CARD = '#08080F'
const BORDER = 'rgba(255,255,255,0.08)'
const ORANGE = '#FF6B00'
const TEXT = '#F0F0F8'
const MUTED = 'rgba(240,240,248,0.5)'
const SUCCESS = '#4ade80'
const WARNING = '#fbbf24'
const DANGER = '#f87171'
const FONT = 'Geist,system-ui,sans-serif'

const STATUS_COLOR: Record<string, string> = {
  PENDING: WARNING, ACCEPTED: ORANGE, PREPARING: ORANGE,
  READY: '#60a5fa', SERVED: '#c084fc', COMPLETED: SUCCESS, CANCELLED: DANGER,
}

const NAV_ITEMS = [
  { key: 'overview',       icon: '📊', label: 'Overview' },
  { key: 'livemap',        icon: '🗺️',  label: 'Live Map' },
  { key: 'orders',         icon: '📋', label: 'Orders' },
  { key: 'menu',           icon: '🍔', label: 'Menu' },
  { key: 'analytics',      icon: '📈', label: 'Analytics' },
  { key: 'qrcodes',        icon: '📱', label: 'QR Codes' },
  { key: 'knowledge',      icon: '🤖', label: 'AI Knowledge' },
  { key: 'employees',      icon: '👥', label: 'Employees' },
  { key: 'inventory',      icon: '📦', label: 'Inventory' },
  { key: 'feedback',       icon: '⭐', label: 'Feedback' },
  { key: 'notifications',  icon: '🔔', label: 'Notifications' },
]
const MANAGER_ONLY = ['employees']

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtPrice(n: number | string) {
  return (typeof n === 'number' ? n : parseFloat(n as string) || 0).toFixed(3)
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}
function elapsed(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  const m = Math.floor(s / 60); const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}
function stars(n: number) {
  return Array.from({ length: 5 }, (_, i) => (
    <span key={i} style={{ color: i < Math.round(n) ? WARNING : 'rgba(255,255,255,0.15)' }}>★</span>
  ))
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '3rem' }}>
      <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: `3px solid ${BORDER}`, borderTopColor: ORANGE, animation: 'spin 0.8s linear infinite' }} />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? MUTED
  return (
    <span style={{ fontSize: '0.62rem', padding: '3px 10px', borderRadius: '100px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', background: `${color}20`, color, border: `1px solid ${color}40` }}>
      {status}
    </span>
  )
}

function KpiCard({ icon, label, value, sub, color = TEXT }: { icon: string; label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '1.4rem' }}>{icon}</div>
      <div style={{ fontSize: '0.68rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: '1.7rem', fontWeight: '700', color, fontFamily: 'monospace', letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: MUTED }}>{sub}</div>}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#0d0d1a', border: `1px solid ${BORDER}`, borderRadius: '20px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflow: 'auto', padding: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', letterSpacing: '-0.03em' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: '1.3rem', cursor: 'pointer', padding: '4px 8px', lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
      <label style={{ fontSize: '0.72rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: BG, border: `1px solid ${BORDER}`, borderRadius: '10px',
  padding: '10px 14px', color: TEXT, fontSize: '0.88rem', fontFamily: FONT, outline: 'none', width: '100%', boxSizing: 'border-box',
}

function Btn({ children, onClick, variant = 'ghost', disabled = false, style: extraStyle }: {
  children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'danger' | 'success'; disabled?: boolean; style?: React.CSSProperties
}) {
  const variants: Record<string, React.CSSProperties> = {
    primary: { background: ORANGE, color: '#fff', border: 'none' },
    ghost: { background: 'transparent', color: MUTED, border: `1px solid ${BORDER}` },
    danger: { background: 'rgba(248,113,113,0.1)', color: DANGER, border: `1px solid rgba(248,113,113,0.25)` },
    success: { background: 'rgba(74,222,128,0.1)', color: SUCCESS, border: `1px solid rgba(74,222,128,0.25)` },
  }
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: '8px 16px', borderRadius: '9px', fontSize: '0.8rem', fontWeight: '600', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: FONT, transition: 'all 0.15s', opacity: disabled ? 0.5 : 1, ...variants[variant], ...extraStyle }}>
      {children}
    </button>
  )
}

// ─── Section: Overview ────────────────────────────────────────────────────────
function OverviewSection() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [aRes, oRes] = await Promise.all([
        fetch('/api/analytics?period=today', { credentials: 'include' }),
        fetch('/api/orders?limit=5', { credentials: 'include' }),
      ])
      if (aRes.ok) setAnalytics(await aRes.json())
      if (oRes.ok) { const d = await oRes.json(); setRecentOrders(d.orders ?? []) }
    } catch { /* handled */ } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load])

  if (loading) return <Spinner />
  const a = analytics

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '700', letterSpacing: '-0.04em' }}>Overview</h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: MUTED }}>Today's performance at a glance</p>
      </div>

      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '16px' }}>
        <KpiCard icon="📋" label="Total Orders" value={a?.totalOrders ?? 0} color={TEXT} />
        <KpiCard icon="💰" label="Revenue Today" value={`${fmtPrice(a?.totalRevenue ?? 0)} JOD`} color={SUCCESS} />
        <KpiCard icon="🪑" label="Active Tables" value={a?.activeTables ?? 0} color="#60a5fa" />
        <KpiCard icon="⏳" label="Pending Orders" value={a?.pendingOrders ?? 0} color={WARNING} />
        <KpiCard icon="📊" label="Avg Order Value" value={`${fmtPrice(a?.avgOrderValue ?? 0)} JOD`} color={ORANGE} />
        <KpiCard icon="⭐" label="Satisfaction" value={a?.customerSatisfaction ? `${a.customerSatisfaction.toFixed(1)}/5` : 'N/A'} color={WARNING} />
      </div>

      {/* Recent Orders */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '20px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>Recent Orders</span>
          <span style={{ fontSize: '0.72rem', color: MUTED }}>Last 5 orders</span>
        </div>
        {recentOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: MUTED, fontSize: '0.82rem' }}>No orders yet today</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: '0.65rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {['#', 'Table', 'Items', 'Total', 'Status', 'Time'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Total' ? 'right' : 'left', fontWeight: '500' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentOrders.map(o => (
                <tr key={o.id} style={{ borderTop: `1px solid rgba(255,255,255,0.04)`, fontSize: '0.82rem' }}>
                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.72rem', color: MUTED }}>#{o.orderNumber}</td>
                  <td style={{ padding: '12px 8px', fontWeight: '600' }}>Table {o.tableNumber}</td>
                  <td style={{ padding: '12px 8px', color: MUTED, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.items?.map(i => `${i.emoji ?? ''} ${i.name} ×${i.quantity}`).join(', ')}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: '700', color: ORANGE, fontFamily: 'monospace' }}>{fmtPrice(o.total)} JOD</td>
                  <td style={{ padding: '12px 8px' }}><StatusBadge status={o.status} /></td>
                  <td style={{ padding: '12px 16px', fontSize: '0.72rem', color: MUTED, fontFamily: 'monospace' }}>{fmtTime(o.placedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Section: Live Map ────────────────────────────────────────────────────────
function LiveMapSection({ socketRef }: { socketRef: React.RefObject<Socket | null> }) {
  const [tables, setTables] = useState<Table[]>([])
  const [selectedTable, setSelectedTable] = useState<Table | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tables', { credentials: 'include' })
      .then(r => r.json()).then(d => setTables(d.tables ?? d ?? []))
      .catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return
    const onNew = (order: Order) => {
      setTables(prev => prev.map(t => t.number === order.tableNumber ? { ...t, activeOrder: order } : t))
    }
    const onStatus = (upd: { id: string; status: string; tableNumber?: number }) => {
      setTables(prev => prev.map(t => t.activeOrder?.id === upd.id ? { ...t, activeOrder: { ...t.activeOrder!, status: upd.status } } : t))
      setSelectedTable(prev => prev?.activeOrder?.id === upd.id ? { ...prev, activeOrder: { ...prev.activeOrder!, status: upd.status } } : prev)
    }
    const onWaiter = (req: { tableNumber: number }) => {
      setTables(prev => prev.map(t => t.number === req.tableNumber ? { ...t, waiterRequested: true } : t))
    }
    socket.on('order:new', onNew)
    socket.on('order:status', onStatus)
    socket.on('waiter:request', onWaiter)
    return () => { socket.off('order:new', onNew); socket.off('order:status', onStatus); socket.off('waiter:request', onWaiter) }
  }, [socketRef])

  function getTableBorder(t: Table): string {
    if (t.waiterRequested) return DANGER
    const s = t.activeOrder?.status
    if (!s) return SUCCESS
    if (s === 'PENDING') return WARNING
    if (s === 'ACCEPTED' || s === 'PREPARING') return ORANGE
    if (s === 'READY') return '#60a5fa'
    if (s === 'SERVED') return '#c084fc'
    return SUCCESS
  }

  async function updateOrderStatus(orderId: string, status: string) {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }), credentials: 'include',
    })
    if (res.ok) {
      const d = await res.json()
      setTables(prev => prev.map(t => t.activeOrder?.id === orderId ? { ...t, activeOrder: { ...t.activeOrder!, status: d.order.status } } : t))
      setSelectedTable(prev => prev?.activeOrder?.id === orderId ? { ...prev, activeOrder: { ...prev.activeOrder!, status: d.order.status } } : prev)
    }
  }

  if (loading) return <Spinner />

  const NEXT: Record<string, [string, string]> = {
    PENDING: ['ACCEPTED', 'Accept'], ACCEPTED: ['PREPARING', 'Preparing'],
    PREPARING: ['READY', 'Mark Ready'], READY: ['SERVED', 'Served'], SERVED: ['COMPLETED', 'Complete'],
  }

  return (
    <div style={{ display: 'flex', gap: '20px', height: '100%' }}>
      {/* Table Grid */}
      <div style={{ flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>🗺️ Live Restaurant Map</span>
          <div style={{ display: 'flex', gap: '12px', fontSize: '0.62rem' }}>
            <span style={{ color: SUCCESS }}>● Available</span>
            <span style={{ color: WARNING }}>● Pending</span>
            <span style={{ color: ORANGE }}>● Preparing</span>
            <span style={{ color: '#60a5fa' }}>● Ready</span>
            <span style={{ color: DANGER }}>● Waiter</span>
            <span style={{ color: '#c084fc' }}>● Served</span>
          </div>
        </div>
        <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '10px', overflow: 'auto' }}>
          {tables.map(t => {
            const borderColor = getTableBorder(t)
            const isSelected = selectedTable?.id === t.id
            return (
              <div key={t.id} onClick={() => setSelectedTable(isSelected ? null : t)}
                style={{ aspectRatio: '1', borderRadius: '12px', background: `${borderColor}12`, border: `2px solid ${isSelected ? borderColor : `${borderColor}50`}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s', transform: isSelected ? 'scale(1.06)' : 'scale(1)', boxShadow: isSelected ? `0 0 18px ${borderColor}40` : 'none', position: 'relative' }}>
                {t.waiterRequested && <div style={{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', borderRadius: '50%', background: DANGER, animation: 'pulse 1.5s infinite' }} />}
                <div style={{ fontSize: '0.55rem', fontWeight: '700', fontFamily: 'monospace', color: MUTED, marginBottom: '2px' }}>T{t.number}</div>
                <div style={{ fontSize: '0.7rem', fontWeight: '700', color: borderColor }}>{t.activeOrder ? t.activeOrder.status.slice(0, 4) : 'FREE'}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Side Panel */}
      {selectedTable && (
        <div style={{ width: '300px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: '700', fontSize: '0.95rem' }}>Table {selectedTable.number}</span>
            <button onClick={() => setSelectedTable(null)} style={{ background: 'transparent', border: 'none', color: MUTED, fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {selectedTable.waiterRequested && (
              <div style={{ background: 'rgba(248,113,113,0.1)', border: `1px solid rgba(248,113,113,0.25)`, borderRadius: '10px', padding: '10px 14px', fontSize: '0.8rem', color: DANGER }}>
                🔴 Waiter requested
              </div>
            )}
            {selectedTable.activeOrder ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                  <span style={{ color: MUTED }}>Order #{selectedTable.activeOrder.orderNumber}</span>
                  <StatusBadge status={selectedTable.activeOrder.status} />
                </div>
                <div style={{ fontSize: '0.72rem', color: MUTED }}>
                  ⏱ {elapsed(selectedTable.activeOrder.placedAt)} elapsed
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {selectedTable.activeOrder.items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                      <span>{item.emoji} {item.name}</span>
                      <span style={{ color: MUTED }}>×{item.quantity}</span>
                    </div>
                  ))}
                </div>
                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '10px', display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '0.9rem' }}>
                  <span>Total</span>
                  <span style={{ color: ORANGE }}>{fmtPrice(selectedTable.activeOrder.total)} JOD</span>
                </div>
                {NEXT[selectedTable.activeOrder.status] && (
                  <Btn variant="primary" onClick={() => updateOrderStatus(selectedTable.activeOrder!.id, NEXT[selectedTable.activeOrder!.status][0])}>
                    → {NEXT[selectedTable.activeOrder.status][1]}
                  </Btn>
                )}
                <Btn variant="danger" onClick={() => updateOrderStatus(selectedTable.activeOrder!.id, 'CANCELLED')}>
                  Cancel Order
                </Btn>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: MUTED, fontSize: '0.82rem' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🪑</div>
                Table is available
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Section: Orders ──────────────────────────────────────────────────────────
function OrdersSection({ socketRef }: { socketRef: React.RefObject<Socket | null> }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [tab, setTab] = useState('All')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/orders', { credentials: 'include' })
      .then(r => r.json()).then(d => setOrders(d.orders ?? []))
      .catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return
    const onNew = (o: Order) => setOrders(prev => [o, ...prev])
    const onStatus = (upd: { id: string; status: string }) => setOrders(prev => prev.map(o => o.id === upd.id ? { ...o, status: upd.status } : o))
    socket.on('order:new', onNew); socket.on('order:status', onStatus)
    return () => { socket.off('order:new', onNew); socket.off('order:status', onStatus) }
  }, [socketRef])

  async function updateStatus(id: string, status: string) {
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }), credentials: 'include',
    })
    if (res.ok) {
      const d = await res.json()
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: d.order.status } : o))
    }
  }

  const TABS = ['All', 'Pending', 'Preparing', 'Ready', 'Completed']
  const tabFilter: Record<string, string[]> = {
    Pending: ['PENDING'], Preparing: ['ACCEPTED', 'PREPARING'],
    Ready: ['READY', 'SERVED'], Completed: ['COMPLETED', 'CANCELLED'], All: [],
  }

  const filtered = tab === 'All' ? orders : orders.filter(o => tabFilter[tab]?.includes(o.status))

  const ACTIONS: Record<string, [string, string, string][]> = {
    PENDING: [['ACCEPTED', 'Accept', 'success'], ['CANCELLED', 'Cancel', 'danger']],
    ACCEPTED: [['PREPARING', 'Preparing', 'primary'], ['CANCELLED', 'Cancel', 'danger']],
    PREPARING: [['READY', 'Mark Ready', 'primary']],
    READY: [['SERVED', 'Served', 'success']],
    SERVED: [['COMPLETED', 'Complete', 'ghost']],
  }

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '700', letterSpacing: '-0.04em' }}>Orders</h1>
        <span style={{ fontSize: '0.8rem', color: MUTED }}>{orders.length} total</span>
      </div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 16px', borderRadius: '9px', border: `1px solid ${tab === t ? ORANGE : BORDER}`, background: tab === t ? `${ORANGE}15` : 'transparent', color: tab === t ? ORANGE : MUTED, fontSize: '0.8rem', fontWeight: tab === t ? '600' : '400', cursor: 'pointer', fontFamily: FONT }}>
            {t}
            <span style={{ marginLeft: '6px', fontSize: '0.65rem', background: 'rgba(255,255,255,0.08)', borderRadius: '100px', padding: '1px 7px' }}>
              {t === 'All' ? orders.length : orders.filter(o => tabFilter[t]?.includes(o.status)).length}
            </span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: MUTED, fontSize: '0.85rem' }}>No orders in this category</div>}
        {filtered.map(o => (
          <div key={o.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>Table {o.tableNumber} <span style={{ color: MUTED, fontWeight: '400', fontSize: '0.8rem' }}>— #{o.orderNumber}</span></div>
                <div style={{ fontSize: '0.72rem', color: MUTED, marginTop: '2px', fontFamily: 'monospace' }}>{fmtTime(o.placedAt)} · {elapsed(o.placedAt)} ago</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontWeight: '700', color: ORANGE, fontFamily: 'monospace', fontSize: '0.95rem' }}>{fmtPrice(o.total)} JOD</span>
                <StatusBadge status={o.status} />
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
              {o.items.map((item, i) => (
                <span key={i} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '4px 10px', fontSize: '0.75rem', color: 'rgba(240,240,248,0.7)' }}>
                  {item.emoji} {item.name} ×{item.quantity}
                </span>
              ))}
            </div>
            {o.notes && <div style={{ fontSize: '0.75rem', color: WARNING, marginBottom: '10px' }}>📝 {o.notes}</div>}
            {ACTIONS[o.status] && (
              <div style={{ display: 'flex', gap: '8px' }}>
                {ACTIONS[o.status].map(([st, label, variant]) => (
                  <Btn key={st} variant={variant as 'primary' | 'ghost' | 'danger' | 'success'} onClick={() => updateStatus(o.id, st)}>{label}</Btn>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Section: Menu ────────────────────────────────────────────────────────────
function MenuSection() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddItem, setShowAddItem] = useState(false)
  const [showAddCat, setShowAddCat] = useState(false)
  const [editItem, setEditItem] = useState<MenuItem | null>(null)
  const [form, setForm] = useState({ name: '', nameAr: '', description: '', price: '', categoryId: '', calories: '', emoji: '', isAvailable: true, isFeatured: false })
  const [catForm, setCatForm] = useState({ name: '', nameAr: '' })
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [cRes, mRes] = await Promise.all([
        fetch('/api/menu/categories', { credentials: 'include' }),
        fetch('/api/menu', { credentials: 'include' }),
      ])
      if (cRes.ok) setCategories(await cRes.json().then(d => d.categories ?? d))
      if (mRes.ok) setItems(await mRes.json().then(d => d.items ?? d))
    } catch { /* handled */ } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const displayItems = selectedCat ? items.filter(i => i.categoryId === selectedCat) : items

  async function toggleAvailable(item: MenuItem) {
    await fetch(`/api/menu/${item.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAvailable: !item.isAvailable }), credentials: 'include',
    })
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, isAvailable: !i.isAvailable } : i))
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this item?')) return
    await fetch(`/api/menu/${id}`, { method: 'DELETE', credentials: 'include' })
    setItems(prev => prev.filter(i => i.id !== id))
  }

  async function saveItem() {
    setSaving(true)
    try {
      const payload = { ...form, price: parseFloat(form.price) || 0, calories: form.calories ? parseInt(form.calories) : undefined }
      const url = editItem ? `/api/menu/${editItem.id}` : '/api/menu'
      const method = editItem ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'include' })
      if (res.ok) { await load(); setShowAddItem(false); setEditItem(null); setForm({ name: '', nameAr: '', description: '', price: '', categoryId: '', calories: '', emoji: '', isAvailable: true, isFeatured: false }) }
    } catch { /* handled */ } finally { setSaving(false) }
  }

  async function saveCat() {
    setSaving(true)
    try {
      const res = await fetch('/api/menu/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(catForm), credentials: 'include' })
      if (res.ok) { await load(); setShowAddCat(false); setCatForm({ name: '', nameAr: '' }) }
    } catch { /* handled */ } finally { setSaving(false) }
  }

  async function deleteCat(id: string) {
    if (!confirm('Delete this category and all its items?')) return
    await fetch(`/api/menu/categories/${id}`, { method: 'DELETE', credentials: 'include' })
    await load()
  }

  function openEdit(item: MenuItem) {
    setEditItem(item)
    setForm({ name: item.name, nameAr: item.nameAr ?? '', description: item.description ?? '', price: String(item.price), categoryId: item.categoryId, calories: item.calories ? String(item.calories) : '', emoji: item.emoji ?? '', isAvailable: item.isAvailable, isFeatured: item.isFeatured })
    setShowAddItem(true)
  }

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'flex', gap: '20px', height: '100%', minHeight: 0 }}>
      {/* Left: Categories */}
      <div style={{ width: '220px', flexShrink: 0, background: CARD, border: `1px solid ${BORDER}`, borderRadius: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: '600', fontSize: '0.85rem' }}>Categories</span>
          <button onClick={() => setShowAddCat(true)} style={{ background: ORANGE, border: 'none', borderRadius: '7px', color: '#fff', fontSize: '1rem', width: '24px', height: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>+</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
          <div onClick={() => setSelectedCat(null)} style={{ padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', background: !selectedCat ? `${ORANGE}15` : 'transparent', color: !selectedCat ? ORANGE : TEXT, fontSize: '0.82rem', fontWeight: !selectedCat ? '600' : '400', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>All Items</span>
            <span style={{ fontSize: '0.7rem', color: MUTED }}>{items.length}</span>
          </div>
          {categories.map(c => (
            <div key={c.id} style={{ padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', background: selectedCat === c.id ? `${ORANGE}15` : 'transparent', color: selectedCat === c.id ? ORANGE : TEXT, fontSize: '0.82rem', fontWeight: selectedCat === c.id ? '600' : '400', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px' }}
              onClick={() => setSelectedCat(c.id)}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: MUTED }}>{items.filter(i => i.categoryId === c.id).length}</span>
                <button onClick={e => { e.stopPropagation(); deleteCat(c.id) }} style={{ background: 'transparent', border: 'none', color: MUTED, cursor: 'pointer', fontSize: '0.7rem', padding: '0 2px' }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Items */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', letterSpacing: '-0.03em' }}>
            {selectedCat ? (categories.find(c => c.id === selectedCat)?.name ?? 'Items') : 'All Items'}
            <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: MUTED, fontWeight: '400' }}>{displayItems.length} items</span>
          </h2>
          <Btn variant="primary" onClick={() => { setEditItem(null); setForm({ name: '', nameAr: '', description: '', price: '', categoryId: selectedCat ?? '', calories: '', emoji: '', isAvailable: true, isFeatured: false }); setShowAddItem(true) }}>+ Add Item</Btn>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '12px', overflow: 'auto' }}>
          {displayItems.map(item => (
            <div key={item.id} style={{ background: CARD, border: `1px solid ${item.isAvailable ? BORDER : 'rgba(248,113,113,0.2)'}`, borderRadius: '16px', overflow: 'hidden', opacity: item.isAvailable ? 1 : 0.65 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem' }}>
                {item.emoji || '🍽️'}
              </div>
              <div style={{ padding: '12px' }}>
                <div style={{ fontWeight: '600', fontSize: '0.85rem', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                <div style={{ fontSize: '0.7rem', color: MUTED, marginBottom: '8px' }}>{item.categoryName ?? categories.find(c => c.id === item.categoryId)?.name}</div>
                <div style={{ fontWeight: '700', color: ORANGE, fontFamily: 'monospace', fontSize: '0.88rem', marginBottom: '10px' }}>{fmtPrice(item.price)} JOD</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => toggleAvailable(item)} style={{ flex: 1, padding: '5px 0', borderRadius: '7px', border: `1px solid ${item.isAvailable ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`, background: item.isAvailable ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)', color: item.isAvailable ? SUCCESS : DANGER, fontSize: '0.68rem', fontWeight: '600', cursor: 'pointer', fontFamily: FONT }}>
                    {item.isAvailable ? '✓ On' : '✕ Off'}
                  </button>
                  <button onClick={() => openEdit(item)} style={{ padding: '5px 8px', borderRadius: '7px', border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, fontSize: '0.68rem', cursor: 'pointer', fontFamily: FONT }}>✏️</button>
                  <button onClick={() => deleteItem(item.id)} style={{ padding: '5px 8px', borderRadius: '7px', border: '1px solid rgba(248,113,113,0.25)', background: 'rgba(248,113,113,0.08)', color: DANGER, fontSize: '0.68rem', cursor: 'pointer', fontFamily: FONT }}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add/Edit Item Modal */}
      {(showAddItem || editItem) && (
        <Modal title={editItem ? 'Edit Item' : 'Add Menu Item'} onClose={() => { setShowAddItem(false); setEditItem(null) }}>
          <FormField label="Name (English)">
            <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Grilled Chicken" />
          </FormField>
          <FormField label="Name (Arabic)">
            <input style={{ ...inputStyle, direction: 'rtl' }} value={form.nameAr} onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))} placeholder="الدجاج المشوي" />
          </FormField>
          <FormField label="Description">
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '70px' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description..." />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Price (JOD)">
              <input style={inputStyle} type="number" step="0.001" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.000" />
            </FormField>
            <FormField label="Calories">
              <input style={inputStyle} type="number" value={form.calories} onChange={e => setForm(f => ({ ...f, calories: e.target.value }))} placeholder="e.g. 450" />
            </FormField>
          </div>
          <FormField label="Category">
            <select style={{ ...inputStyle, appearance: 'none' }} value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
              <option value="">Select category...</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="Emoji">
            <input style={inputStyle} value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} placeholder="🍔" maxLength={4} />
          </FormField>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isAvailable} onChange={e => setForm(f => ({ ...f, isAvailable: e.target.checked }))} />
              Available
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={form.isFeatured} onChange={e => setForm(f => ({ ...f, isFeatured: e.target.checked }))} />
              Featured
            </label>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => { setShowAddItem(false); setEditItem(null) }}>Cancel</Btn>
            <Btn variant="primary" onClick={saveItem} disabled={saving}>{saving ? 'Saving…' : editItem ? 'Save Changes' : 'Add Item'}</Btn>
          </div>
        </Modal>
      )}

      {/* Add Category Modal */}
      {showAddCat && (
        <Modal title="Add Category" onClose={() => setShowAddCat(false)}>
          <FormField label="Category Name">
            <input style={inputStyle} value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Burgers" />
          </FormField>
          <FormField label="Category Name (Arabic)">
            <input style={{ ...inputStyle, direction: 'rtl' }} value={catForm.nameAr} onChange={e => setCatForm(f => ({ ...f, nameAr: e.target.value }))} placeholder="برغر" />
          </FormField>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setShowAddCat(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={saveCat} disabled={saving}>{saving ? 'Saving…' : 'Add Category'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Section: Analytics ───────────────────────────────────────────────────────
function AnalyticsSection() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'year'>('today')
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/analytics?period=${period}`, { credentials: 'include' })
      .then(r => r.json()).then(setAnalytics)
      .catch(() => {}).finally(() => setLoading(false))
  }, [period])

  const a = analytics
  const maxRevDay = Math.max(...(a?.revenueByDay?.map(d => d.revenue) ?? [1]))
  const maxHour = Math.max(...(a?.peakHours?.map(h => h.orders) ?? [1]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '700', letterSpacing: '-0.04em' }}>Analytics</h1>
        <div style={{ display: 'flex', gap: '6px' }}>
          {(['today', 'week', 'month', 'year'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{ padding: '7px 14px', borderRadius: '9px', border: `1px solid ${period === p ? ORANGE : BORDER}`, background: period === p ? `${ORANGE}15` : 'transparent', color: period === p ? ORANGE : MUTED, fontSize: '0.78rem', fontWeight: period === p ? '600' : '400', cursor: 'pointer', fontFamily: FONT, textTransform: 'capitalize' }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? <Spinner /> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '16px' }}>
            <KpiCard icon="💰" label="Total Revenue" value={`${fmtPrice(a?.totalRevenue ?? 0)} JOD`} color={SUCCESS} />
            <KpiCard icon="📋" label="Total Orders" value={a?.totalOrders ?? 0} />
            <KpiCard icon="📊" label="Avg Order Value" value={`${fmtPrice(a?.avgOrderValue ?? 0)} JOD`} color={ORANGE} />
            <KpiCard icon="⭐" label="Satisfaction" value={a?.customerSatisfaction ? `${a.customerSatisfaction.toFixed(1)}/5` : 'N/A'} color={WARNING} />
          </div>

          {/* Revenue Bar Chart */}
          {a?.revenueByDay && a.revenueByDay.length > 0 && (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '20px', padding: '20px' }}>
              <div style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: '20px' }}>Revenue Trend</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {a.revenueByDay.map((d, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '60px', fontSize: '0.72rem', color: MUTED, textAlign: 'right', flexShrink: 0 }}>{d.label}</div>
                    <div style={{ flex: 1, height: '28px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(d.revenue / maxRevDay) * 100}%`, background: `linear-gradient(90deg, ${ORANGE}cc, ${ORANGE})`, borderRadius: '6px', transition: 'width 0.6s ease', minWidth: d.revenue > 0 ? '4px' : 0 }} />
                    </div>
                    <div style={{ width: '80px', fontSize: '0.72rem', fontFamily: 'monospace', color: ORANGE, textAlign: 'right', flexShrink: 0 }}>{fmtPrice(d.revenue)} JOD</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Items */}
          {a?.topItems && a.topItems.length > 0 && (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '20px', overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, fontWeight: '600', fontSize: '0.9rem' }}>Top 5 Items</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ fontSize: '0.65rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {['#', 'Item', 'Orders', 'Revenue'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Revenue' || h === 'Orders' ? 'right' : 'left', fontWeight: '500' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.topItems.slice(0, 5).map((item, i) => (
                    <tr key={i} style={{ borderTop: `1px solid rgba(255,255,255,0.04)`, fontSize: '0.82rem' }}>
                      <td style={{ padding: '12px 16px', color: MUTED, fontFamily: 'monospace' }}>{i + 1}</td>
                      <td style={{ padding: '12px 8px', fontWeight: '600' }}>{item.name}</td>
                      <td style={{ padding: '12px 8px', textAlign: 'right', color: MUTED }}>{item.orders}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '700', color: ORANGE, fontFamily: 'monospace' }}>{fmtPrice(item.revenue)} JOD</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Peak Hours */}
          {a?.peakHours && a.peakHours.length > 0 && (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '20px', padding: '20px' }}>
              <div style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: '20px' }}>Peak Hours</div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', height: '80px' }}>
                {a.peakHours.map((h, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '100%', background: `${ORANGE}${Math.round((h.orders / maxHour) * 200 + 55).toString(16)}`, borderRadius: '4px 4px 0 0', height: `${Math.max((h.orders / maxHour) * 64, 4)}px`, transition: 'height 0.4s ease' }} />
                    <div style={{ fontSize: '0.55rem', color: MUTED, fontFamily: 'monospace' }}>{h.hour}h</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Section: QR Codes ────────────────────────────────────────────────────────
function QrCodesSection({ restaurant }: { restaurant: Restaurant | null }) {
  const [tables, setTables] = useState<Table[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/tables', { credentials: 'include' })
      .then(r => r.json()).then(d => setTables(d.tables ?? d ?? []))
      .catch(() => {}).finally(() => setLoading(false))
  }, [])

  function getUrl(t: Table) {
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    return `${base}/r/${restaurant?.slug ?? 'restaurant'}/${t.qrToken}`
  }

  async function copyLink(t: Table) {
    await navigator.clipboard.writeText(getUrl(t))
    setCopied(t.id); setTimeout(() => setCopied(null), 2000)
  }

  async function regenerate(t: Table) {
    const res = await fetch(`/api/tables/${t.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regenerateQr: true }), credentials: 'include',
    })
    if (res.ok) {
      const d = await res.json()
      setTables(prev => prev.map(tb => tb.id === t.id ? { ...tb, qrToken: d.table?.qrToken ?? tb.qrToken } : tb))
    }
  }

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '700', letterSpacing: '-0.04em' }}>QR Codes</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '16px' }}>
        {tables.map(t => {
          const url = getUrl(t)
          return (
            <div key={t.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '16px', overflow: 'hidden' }}>
              {/* QR Visual Placeholder */}
              <div style={{ background: '#fff', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px', width: '80px', height: '80px' }}>
                  {Array.from({ length: 49 }, (_, i) => (
                    <div key={i} style={{ background: [0,1,2,7,8,9,14,5,6,13,35,36,37,42,43,44,49,40,41,48,6,13,20,27,34,24,25,26].includes(i) ? '#000' : Math.random() > 0.55 ? '#000' : '#fff', borderRadius: '1px' }} />
                  ))}
                </div>
              </div>
              <div style={{ padding: '14px' }}>
                <div style={{ fontWeight: '700', fontSize: '0.9rem', marginBottom: '4px' }}>Table {t.number}</div>
                {t.label && <div style={{ fontSize: '0.72rem', color: MUTED, marginBottom: '8px' }}>{t.label}</div>}
                <div style={{ fontSize: '0.62rem', color: MUTED, fontFamily: 'monospace', wordBreak: 'break-all', background: BG, border: `1px solid ${BORDER}`, borderRadius: '6px', padding: '6px 8px', marginBottom: '10px', lineHeight: 1.4 }}>
                  {url}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button onClick={() => copyLink(t)} style={{ flex: 1, padding: '6px 8px', borderRadius: '8px', border: `1px solid ${copied === t.id ? 'rgba(74,222,128,0.4)' : BORDER}`, background: copied === t.id ? 'rgba(74,222,128,0.1)' : 'transparent', color: copied === t.id ? SUCCESS : MUTED, fontSize: '0.7rem', cursor: 'pointer', fontFamily: FONT, fontWeight: '500' }}>
                    {copied === t.id ? '✓ Copied!' : '📋 Copy'}
                  </button>
                  <button onClick={() => regenerate(t)} style={{ padding: '6px 8px', borderRadius: '8px', border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, fontSize: '0.7rem', cursor: 'pointer', fontFamily: FONT }} title="Regenerate QR token">
                    🔄
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Section: AI Knowledge ────────────────────────────────────────────────────
function KnowledgeSection() {
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState<KnowledgeItem | null>(null)
  const [form, setForm] = useState({ category: 'restaurant_info', title: '', content: '' })
  const [saving, setSaving] = useState(false)

  const KNOWLEDGE_CATS = [
    { value: 'restaurant_info', label: 'Restaurant Story' },
    { value: 'hours', label: 'Opening Hours' },
    { value: 'policies', label: 'Policies' },
    { value: 'ingredients', label: 'Ingredients & Allergies' },
    { value: 'promotions', label: 'Promotions' },
    { value: 'events', label: 'Events' },
    { value: 'other', label: 'Other' },
  ]

  async function load() {
    fetch('/api/knowledge', { credentials: 'include' })
      .then(r => r.json()).then(d => setItems(d.items ?? d ?? []))
      .catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function save() {
    setSaving(true)
    try {
      const url = editItem ? `/api/knowledge/${editItem.id}` : '/api/knowledge'
      const method = editItem ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form), credentials: 'include' })
      if (res.ok) { await load(); setShowAdd(false); setEditItem(null); setForm({ category: 'restaurant_info', title: '', content: '' }) }
    } catch { /* handled */ } finally { setSaving(false) }
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this knowledge item?')) return
    await fetch(`/api/knowledge/${id}`, { method: 'DELETE', credentials: 'include' })
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const grouped = KNOWLEDGE_CATS.map(c => ({ ...c, items: items.filter(i => i.category === c.value) })).filter(g => g.items.length > 0)

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '700', letterSpacing: '-0.04em' }}>AI Knowledge Base</h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: MUTED }}>Information your AI assistant uses to answer customer questions</p>
        </div>
        <Btn variant="primary" onClick={() => { setEditItem(null); setForm({ category: 'restaurant_info', title: '', content: '' }); setShowAdd(true) }}>+ Add Knowledge</Btn>
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem', color: MUTED, background: CARD, borderRadius: '20px', border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🤖</div>
          <div style={{ fontSize: '0.9rem', marginBottom: '4px' }}>No knowledge items yet</div>
          <div style={{ fontSize: '0.78rem' }}>Add information your AI will use to assist customers</div>
        </div>
      )}

      {grouped.map(g => (
        <div key={g.value} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '20px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{g.label}</span>
            <span style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: '100px', background: `${ORANGE}15`, color: ORANGE }}>{g.items.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {g.items.map((item, i) => (
              <div key={item.id} style={{ padding: '14px 20px', borderTop: i > 0 ? `1px solid rgba(255,255,255,0.04)` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '600', fontSize: '0.85rem', marginBottom: '4px' }}>{item.title}</div>
                  <div style={{ fontSize: '0.78rem', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, lineHeight: 1.5 }}>{item.content}</div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <button onClick={() => { setEditItem(item); setForm({ category: item.category, title: item.title, content: item.content }); setShowAdd(true) }} style={{ padding: '5px 10px', borderRadius: '7px', border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, fontSize: '0.72rem', cursor: 'pointer', fontFamily: FONT }}>✏️ Edit</button>
                  <button onClick={() => deleteItem(item.id)} style={{ padding: '5px 10px', borderRadius: '7px', border: '1px solid rgba(248,113,113,0.25)', background: 'rgba(248,113,113,0.08)', color: DANGER, fontSize: '0.72rem', cursor: 'pointer', fontFamily: FONT }}>🗑 Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {showAdd && (
        <Modal title={editItem ? 'Edit Knowledge' : 'Add Knowledge'} onClose={() => { setShowAdd(false); setEditItem(null) }}>
          <FormField label="Category">
            <select style={{ ...inputStyle, appearance: 'none' }} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {KNOWLEDGE_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </FormField>
          <FormField label="Title">
            <input style={inputStyle} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Our Story" />
          </FormField>
          <FormField label="Content">
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: '120px' }} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="Write the information here..." />
          </FormField>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => { setShowAdd(false); setEditItem(null) }}>Cancel</Btn>
            <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editItem ? 'Save Changes' : 'Add'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Section: Employees ───────────────────────────────────────────────────────
function EmployeesSection() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'WAITER', password: '' })
  const [saving, setSaving] = useState(false)

  const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'WAITER', 'KITCHEN']

  async function load() {
    fetch('/api/users', { credentials: 'include' })
      .then(r => r.json()).then(d => setEmployees(d.users ?? d ?? []))
      .catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form), credentials: 'include' })
      if (res.ok) { await load(); setShowAdd(false); setForm({ name: '', email: '', role: 'WAITER', password: '' }) }
    } catch { /* handled */ } finally { setSaving(false) }
  }

  async function toggleActive(emp: Employee) {
    await fetch(`/api/users/${emp.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !emp.isActive }), credentials: 'include' })
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, isActive: !e.isActive } : e))
  }

  async function changeRole(emp: Employee, role: string) {
    await fetch(`/api/users/${emp.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role }), credentials: 'include' })
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, role } : e))
  }

  const ROLE_COLOR: Record<string, string> = { OWNER: '#c084fc', ADMIN: DANGER, MANAGER: ORANGE, WAITER: '#60a5fa', KITCHEN: WARNING }

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '700', letterSpacing: '-0.04em' }}>Employees</h1>
        <Btn variant="primary" onClick={() => setShowAdd(true)}>+ Add Employee</Btn>
      </div>

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '20px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ fontSize: '0.65rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${BORDER}` }}>
              {['Name', 'Email', 'Role', 'Status', 'Last Login', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '500' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: MUTED, fontSize: '0.85rem' }}>No employees found</td></tr>
            )}
            {employees.map(e => (
              <tr key={e.id} style={{ borderTop: `1px solid rgba(255,255,255,0.04)`, fontSize: '0.82rem' }}>
                <td style={{ padding: '14px 16px', fontWeight: '600' }}>{e.name}</td>
                <td style={{ padding: '14px 8px', color: MUTED, fontFamily: 'monospace', fontSize: '0.75rem' }}>{e.email}</td>
                <td style={{ padding: '14px 8px' }}>
                  <select value={e.role} onChange={ev => changeRole(e, ev.target.value)} style={{ background: BG, border: `1px solid ${ROLE_COLOR[e.role] ?? BORDER}40`, borderRadius: '7px', color: ROLE_COLOR[e.role] ?? TEXT, fontSize: '0.72rem', padding: '4px 8px', cursor: 'pointer', fontFamily: FONT, fontWeight: '600' }}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td style={{ padding: '14px 8px' }}>
                  <button onClick={() => toggleActive(e)} style={{ padding: '4px 12px', borderRadius: '100px', border: `1px solid ${e.isActive ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`, background: e.isActive ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', color: e.isActive ? SUCCESS : DANGER, fontSize: '0.65rem', fontWeight: '700', cursor: 'pointer', fontFamily: FONT }}>
                    {e.isActive ? '● Active' : '○ Inactive'}
                  </button>
                </td>
                <td style={{ padding: '14px 8px', fontSize: '0.72rem', color: MUTED, fontFamily: 'monospace' }}>
                  {e.lastLoginAt ? fmtDate(e.lastLoginAt) : '—'}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <Btn variant="danger" onClick={() => toggleActive(e)} style={{ fontSize: '0.7rem', padding: '5px 12px' }}>
                    {e.isActive ? 'Deactivate' : 'Activate'}
                  </Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <Modal title="Add Employee" onClose={() => setShowAdd(false)}>
          <FormField label="Full Name">
            <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="John Doe" />
          </FormField>
          <FormField label="Email">
            <input style={inputStyle} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@restaurant.com" />
          </FormField>
          <FormField label="Role">
            <select style={{ ...inputStyle, appearance: 'none' }} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </FormField>
          <FormField label="Password">
            <input style={inputStyle} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Temporary password" />
          </FormField>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Add Employee'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Section: Inventory ───────────────────────────────────────────────────────
function InventorySection() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', quantity: '', unit: 'kg', lowStockThreshold: '' })
  const [saving, setSaving] = useState(false)

  async function load() {
    fetch('/api/inventory', { credentials: 'include' })
      .then(r => r.json()).then(d => setItems(d.items ?? d ?? []))
      .catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, quantity: parseFloat(form.quantity) || 0, lowStockThreshold: parseFloat(form.lowStockThreshold) || 0 }),
        credentials: 'include',
      })
      if (res.ok) { await load(); setShowAdd(false); setForm({ name: '', quantity: '', unit: 'kg', lowStockThreshold: '' }) }
    } catch { /* handled */ } finally { setSaving(false) }
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this inventory item?')) return
    await fetch(`/api/inventory/${id}`, { method: 'DELETE', credentials: 'include' })
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function getStatus(item: InventoryItem): [string, string] {
    if (item.quantity <= 0) return ['Critical', DANGER]
    if (item.quantity <= item.lowStockThreshold) return ['Low', WARNING]
    return ['OK', SUCCESS]
  }

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '700', letterSpacing: '-0.04em' }}>Inventory</h1>
        <Btn variant="primary" onClick={() => setShowAdd(true)}>+ Add Item</Btn>
      </div>

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '20px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ fontSize: '0.65rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${BORDER}` }}>
              {['Item', 'Quantity', 'Unit', 'Low Stock Threshold', 'Status', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '500' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: MUTED, fontSize: '0.85rem' }}>No inventory items yet</td></tr>
            )}
            {items.map(item => {
              const [statusLabel, statusColor] = getStatus(item)
              return (
                <tr key={item.id} style={{ borderTop: `1px solid rgba(255,255,255,0.04)`, fontSize: '0.82rem', background: statusLabel === 'Critical' ? 'rgba(248,113,113,0.04)' : statusLabel === 'Low' ? 'rgba(251,191,36,0.03)' : 'transparent' }}>
                  <td style={{ padding: '14px 16px', fontWeight: '600' }}>{item.name}</td>
                  <td style={{ padding: '14px 8px', fontFamily: 'monospace', fontWeight: '700', color: statusColor }}>{item.quantity}</td>
                  <td style={{ padding: '14px 8px', color: MUTED, fontSize: '0.75rem' }}>{item.unit}</td>
                  <td style={{ padding: '14px 8px', color: MUTED, fontFamily: 'monospace' }}>{item.lowStockThreshold}</td>
                  <td style={{ padding: '14px 8px' }}>
                    <span style={{ fontSize: '0.65rem', padding: '3px 10px', borderRadius: '100px', fontWeight: '700', background: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}40` }}>
                      {statusLabel}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <Btn variant="danger" onClick={() => deleteItem(item.id)} style={{ fontSize: '0.7rem', padding: '5px 10px' }}>Delete</Btn>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <Modal title="Add Inventory Item" onClose={() => setShowAdd(false)}>
          <FormField label="Item Name">
            <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Chicken Breast" />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <FormField label="Quantity">
              <input style={inputStyle} type="number" step="0.1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="10" />
            </FormField>
            <FormField label="Unit">
              <select style={{ ...inputStyle, appearance: 'none' }} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
                {['kg', 'g', 'L', 'mL', 'pcs', 'boxes', 'units'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Low Stock Threshold">
            <input style={inputStyle} type="number" step="0.1" value={form.lowStockThreshold} onChange={e => setForm(f => ({ ...f, lowStockThreshold: e.target.value }))} placeholder="2" />
          </FormField>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Add Item'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Section: Feedback ────────────────────────────────────────────────────────
function FeedbackSection() {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/feedback', { credentials: 'include' })
      .then(r => r.json()).then(d => setItems(d.feedback ?? d ?? []))
      .catch(() => {}).finally(() => setLoading(false))
  }, [])

  const avg = (key: keyof FeedbackItem) => items.length ? (items.reduce((s, i) => s + (i[key] as number), 0) / items.length) : 0

  if (loading) return <Spinner />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '700', letterSpacing: '-0.04em' }}>Customer Feedback</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px' }}>
        {[
          { icon: '🍔', label: 'Food Rating', val: avg('foodRating') },
          { icon: '👨‍🍳', label: 'Service Rating', val: avg('serviceRating') },
          { icon: '🏠', label: 'Atmosphere', val: avg('atmosphereRating') },
        ].map(c => (
          <div key={c.label} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{c.icon}</div>
            <div style={{ fontSize: '0.68rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>{c.label}</div>
            <div style={{ fontSize: '1.8rem', fontWeight: '700', fontFamily: 'monospace', color: WARNING }}>{c.val.toFixed(1)}</div>
            <div style={{ fontSize: '1rem', marginTop: '6px' }}>{stars(c.val)}</div>
          </div>
        ))}
      </div>

      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: MUTED, background: CARD, borderRadius: '20px', border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⭐</div>
          No feedback yet
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map(fb => (
            <div key={fb.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '16px', padding: '18px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: '600' }}>Table {fb.tableNumber}</div>
                <div style={{ fontSize: '0.72rem', color: MUTED, fontFamily: 'monospace' }}>{fmtDate(fb.createdAt)}</div>
              </div>
              <div style={{ display: 'flex', gap: '16px', marginBottom: fb.comment ? '10px' : '0', fontSize: '0.78rem' }}>
                <span>🍔 {stars(fb.foodRating)}</span>
                <span>👨‍🍳 {stars(fb.serviceRating)}</span>
                <span>🏠 {stars(fb.atmosphereRating)}</span>
              </div>
              {fb.comment && <div style={{ fontSize: '0.82rem', color: 'rgba(240,240,248,0.7)', fontStyle: 'italic', lineHeight: 1.5 }}>"{fb.comment}"</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Section: Notifications ───────────────────────────────────────────────────
function NotificationsSection({ events, onClear }: { events: NotificationEvent[]; onClear: () => void }) {
  const TYPE_COLOR: Record<string, string> = { 'order:new': SUCCESS, 'order:status': '#60a5fa', 'waiter:request': DANGER, 'waiter:resolved': MUTED }
  const TYPE_ICON: Record<string, string> = { 'order:new': '📋', 'order:status': '🔄', 'waiter:request': '🔔', 'waiter:resolved': '✅' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '700', letterSpacing: '-0.04em' }}>Notifications</h1>
        {events.length > 0 && <Btn variant="ghost" onClick={onClear}>Clear All</Btn>}
      </div>
      {events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: MUTED, background: CARD, borderRadius: '20px', border: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔔</div>
          No notifications yet — they will appear here in real-time
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {events.map(ev => {
            const color = TYPE_COLOR[ev.type] ?? MUTED
            return (
              <div key={ev.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${color}`, borderRadius: '12px', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <span style={{ fontSize: '1.1rem' }}>{TYPE_ICON[ev.type] ?? '📌'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: '600', marginBottom: '2px', color }}>{ev.type}</div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(240,240,248,0.75)' }}>{ev.message}</div>
                  {ev.tableNumber && <div style={{ fontSize: '0.72rem', color: MUTED, marginTop: '2px' }}>Table {ev.tableNumber}</div>}
                </div>
                <div style={{ fontSize: '0.68rem', color: MUTED, fontFamily: 'monospace', flexShrink: 0 }}>{fmtTime(ev.timestamp)}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ManagerPage() {
  const [section, setSection] = useState<string>('overview')
  const [user, setUser] = useState<User | null>(null)
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [connected, setConnected] = useState(false)
  const [notifCount, setNotifCount] = useState(0)
  const [notifications, setNotifications] = useState<NotificationEvent[]>([])
  const [authLoading, setAuthLoading] = useState(true)
  const socketRef = useRef<Socket | null>(null)

  // Auth check
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('unauth'); return r.json() })
      .then(d => {
        setUser(d.user ?? d)
        setRestaurant(d.restaurant ?? null)
        const role = (d.user ?? d)?.role
        if (role === 'KITCHEN') window.location.href = '/kitchen'
        else if (role === 'WAITER') window.location.href = '/waiter'
      })
      .catch(() => { window.location.href = '/auth/login' })
      .finally(() => setAuthLoading(false))
  }, [])

  // Socket.io
  useEffect(() => {
    if (authLoading) return
    const token = document.cookie.match(/tt_access=([^;]+)/)?.[1]
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? '', {
      path: '/api/socket', auth: { token }, reconnection: true, reconnectionDelay: 1000,
    })
    socketRef.current = socket

    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    function addNotif(type: string, message: string, tableNumber?: number) {
      const ev: NotificationEvent = { id: `${Date.now()}-${Math.random()}`, type, message, tableNumber, timestamp: new Date().toISOString() }
      setNotifications(prev => [ev, ...prev].slice(0, 100))
      setNotifCount(n => n + 1)
    }

    socket.on('order:new', (o: Order) => addNotif('order:new', `New order #${o.orderNumber} from Table ${o.tableNumber}`, o.tableNumber))
    socket.on('order:status', (u: { orderNumber?: number; tableNumber?: number; status: string }) => addNotif('order:status', `Order status → ${u.status}`, u.tableNumber))
    socket.on('waiter:request', (r: { tableNumber: number; note?: string }) => addNotif('waiter:request', r.note ?? 'Waiter requested', r.tableNumber))
    socket.on('waiter:resolved', (r: { tableNumber: number }) => addNotif('waiter:resolved', 'Waiter request resolved', r.tableNumber))

    return () => { socket.disconnect() }
  }, [authLoading])

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    window.location.href = '/auth/login'
  }

  function handleSectionChange(key: string) {
    setSection(key)
    if (key === 'notifications') setNotifCount(0)
  }

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'OWNER'

  const visibleNav = NAV_ITEMS.filter(item => {
    if (MANAGER_ONLY.includes(item.key)) return isAdmin || user?.role === 'MANAGER'
    return true
  })

  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, color: TEXT }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: `3px solid ${BORDER}`, borderTopColor: ORANGE, animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ fontSize: '0.85rem', color: MUTED }}>Loading dashboard…</div>
        </div>
      </div>
    )
  }

  const sidebarW = sidebarOpen ? '240px' : '64px'

  function renderSection() {
    switch (section) {
      case 'overview':     return <OverviewSection />
      case 'livemap':      return <LiveMapSection socketRef={socketRef} />
      case 'orders':       return <OrdersSection socketRef={socketRef} />
      case 'menu':         return <MenuSection />
      case 'analytics':    return <AnalyticsSection />
      case 'qrcodes':      return <QrCodesSection restaurant={restaurant} />
      case 'knowledge':    return <KnowledgeSection />
      case 'employees':    return <EmployeesSection />
      case 'inventory':    return <InventorySection />
      case 'feedback':     return <FeedbackSection />
      case 'notifications': return <NotificationsSection events={notifications} onClear={() => { setNotifications([]); setNotifCount(0) }} />
      default:             return null
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: FONT, display: 'flex' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 100px; }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: sidebarW, flexShrink: 0, background: CARD, borderRight: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', transition: 'width 0.25s ease', overflow: 'hidden', position: 'sticky', top: 0, height: '100vh' }}>
        {/* Logo */}
        <div style={{ padding: sidebarOpen ? '20px 20px 16px' : '20px 0 16px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `1px solid ${BORDER}`, justifyContent: sidebarOpen ? 'flex-start' : 'center', flexShrink: 0 }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', flexShrink: 0 }}>🍽️</div>
          {sidebarOpen && <span style={{ fontWeight: '800', fontSize: '0.95rem', letterSpacing: '-0.04em', whiteSpace: 'nowrap', overflow: 'hidden' }}>{restaurant?.name ?? 'TalkTable'}</span>}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflow: 'auto', padding: '10px 8px' }}>
          {visibleNav.map(item => {
            const active = section === item.key
            const isNotif = item.key === 'notifications'
            return (
              <button key={item.key} onClick={() => handleSectionChange(item.key)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: sidebarOpen ? '9px 12px' : '9px 0', justifyContent: sidebarOpen ? 'flex-start' : 'center', borderRadius: '10px', border: 'none', background: active ? `${ORANGE}15` : 'transparent', color: active ? ORANGE : MUTED, fontSize: '0.82rem', fontWeight: active ? '600' : '400', cursor: 'pointer', fontFamily: FONT, transition: 'all 0.15s', marginBottom: '2px', position: 'relative' }}
                onMouseOver={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                onMouseOut={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                <span style={{ fontSize: '1rem', flexShrink: 0 }}>{item.icon}</span>
                {sidebarOpen && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
                {isNotif && notifCount > 0 && (
                  <span style={{ position: 'absolute', top: '4px', right: sidebarOpen ? '8px' : '4px', background: DANGER, color: '#fff', fontSize: '0.55rem', fontWeight: '800', borderRadius: '100px', padding: '1px 5px', minWidth: '16px', textAlign: 'center' }}>
                    {notifCount > 99 ? '99+' : notifCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Collapse toggle */}
        <div style={{ padding: '12px 8px', borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <button onClick={() => setSidebarOpen(s => !s)} style={{ width: '100%', padding: '8px', borderRadius: '10px', border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, cursor: 'pointer', fontFamily: FONT, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            {sidebarOpen ? '◀ Collapse' : '▶'}
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Top Header */}
        <header style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, position: 'sticky', top: 0, zIndex: 100 }}>
          {/* Breadcrumb */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.68rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Manager Dashboard</div>
            <div style={{ fontWeight: '700', fontSize: '0.95rem', letterSpacing: '-0.03em', textTransform: 'capitalize' }}>
              {NAV_ITEMS.find(n => n.key === section)?.label ?? section}
            </div>
          </div>

          {/* Connection status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', padding: '4px 12px', borderRadius: '100px', background: connected ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', border: `1px solid ${connected ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}`, color: connected ? SUCCESS : DANGER }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: connected ? SUCCESS : DANGER, display: 'inline-block', animation: connected ? 'pulse 2s infinite' : 'none' }} />
            {connected ? 'Live' : 'Offline'}
          </div>

          {/* Notifications bell */}
          <button onClick={() => handleSectionChange('notifications')} style={{ position: 'relative', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: '10px', color: MUTED, cursor: 'pointer', padding: '7px 10px', fontSize: '0.95rem', fontFamily: FONT }}>
            🔔
            {notifCount > 0 && <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: DANGER, color: '#fff', fontSize: '0.5rem', fontWeight: '800', borderRadius: '100px', padding: '1px 4px', minWidth: '14px', textAlign: 'center' }}>{notifCount > 99 ? '99+' : notifCount}</span>}
          </button>

          {/* User info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: `${ORANGE}25`, border: `1px solid ${ORANGE}50`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: '700', color: ORANGE }}>
              {user?.name?.charAt(0).toUpperCase() ?? 'M'}
            </div>
            {sidebarOpen && (
              <div style={{ lineHeight: 1.3 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: '600' }}>{user?.name ?? 'Manager'}</div>
                <div style={{ fontSize: '0.65rem', color: MUTED, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{user?.role ?? 'MANAGER'}</div>
              </div>
            )}
          </div>

          <button onClick={logout} style={{ padding: '7px 14px', borderRadius: '9px', border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, fontSize: '0.75rem', cursor: 'pointer', fontFamily: FONT, flexShrink: 0 }}>
            Sign Out
          </button>
        </header>

        {/* Content */}
        <main style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {renderSection()}
        </main>
      </div>
    </div>
  )
}
