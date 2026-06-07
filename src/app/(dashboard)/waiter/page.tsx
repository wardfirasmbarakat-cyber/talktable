// src/app/(dashboard)/waiter/page.tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { io, type Socket } from 'socket.io-client'

interface WaiterRequest { id: string; tableNumber: number; createdAt: string; status: string; note?: string }
interface LiveOrder { id: string; orderNumber: number; tableNumber: number; status: string; total: string | number; items: { name: string; quantity: number }[]; placedAt: string }

const TABLE_STATUS: Record<number, string> = {
  1:'available',2:'ordering',3:'ordering',4:'attention',5:'waiter',
  6:'available',7:'ordering',8:'ready',9:'available',10:'ordering',
  11:'available',12:'waiter',13:'ordering',14:'available',15:'ready',
  16:'ordering',17:'available',18:'ordering',19:'available',20:'ordering',
}
const TABLE_COLOR: Record<string, string> = {
  available:'rgba(34,197,94,0.12)',ordering:'rgba(79,158,255,0.12)',
  attention:'rgba(245,158,11,0.12)',waiter:'rgba(232,32,42,0.14)',ready:'rgba(139,92,246,0.12)',
}
const TABLE_BORDER: Record<string, string> = {
  available:'rgba(34,197,94,0.25)',ordering:'rgba(79,158,255,0.25)',
  attention:'rgba(245,158,11,0.3)',waiter:'rgba(232,32,42,0.35)',ready:'rgba(139,92,246,0.3)',
}
const TABLE_TEXT: Record<string, string> = {
  available:'#4ade80',ordering:'#7dd3fc',attention:'#fbbf24',waiter:'#f87171',ready:'#c4b5fd',
}
const TABLE_ICON: Record<string, string> = {
  available:'🟢',ordering:'🔵',attention:'🟡',waiter:'🔴',ready:'🟣',
}

export default function WaiterPage() {
  const [requests, setRequests] = useState<WaiterRequest[]>([])
  const [orders, setOrders] = useState<LiveOrder[]>([])
  const [connected, setConnected] = useState(false)
  const [selectedTable, setSelectedTable] = useState<number | null>(null)
  const socketRef = useRef<Socket | null>(null)

  const playChime = useCallback(() => {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(1046, ctx.currentTime)
      osc.frequency.setValueAtTime(1318, ctx.currentTime + 0.15)
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
      osc.start(); osc.stop(ctx.currentTime + 0.6)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const [ordRes] = await Promise.all([
          fetch('/api/orders?limit=20', { credentials: 'include' }),
        ])
        if (ordRes.ok) { const d = await ordRes.json(); setOrders(d.orders ?? []) }
      } catch { /* ignore */ }
    }
    load()
  }, [])

  useEffect(() => {
    const token = document.cookie.match(/tt_access=([^;]+)/)?.[1]
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? '', { path: '/api/socket', auth: { token }, reconnection: true })
    socketRef.current = socket
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('waiter:request', (req: WaiterRequest) => {
      setRequests(prev => [req, ...prev]); playChime()
    })
    socket.on('order:ready', (data: { orderNumber: number; tableNumber: number; message: string }) => {
      playChime()
      setRequests(prev => [{
        id: `ready-${data.orderNumber}`, tableNumber: data.tableNumber,
        createdAt: new Date().toISOString(), status: 'OPEN', note: data.message
      }, ...prev])
    })
    socket.on('order:new', (o: LiveOrder) => setOrders(prev => [o, ...prev]))
    socket.on('order:status', (upd: { id: string; status: string }) => {
      setOrders(prev => prev.map(o => o.id === upd.id ? { ...o, status: upd.status } : o))
    })
    return () => { socket.disconnect() }
  }, [playChime])

  async function resolveRequest(id: string) {
    setRequests(prev => prev.filter(r => r.id !== id))
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    window.location.href = '/auth/login'
  }

  const statusPill = (s: string) => {
    const map: Record<string, [string, string]> = {
      PENDING: ['rgba(79,158,255,0.12)','#7dd3fc'], ACCEPTED: ['rgba(245,158,11,0.12)','#fbbf24'],
      PREPARING: ['rgba(245,158,11,0.12)','#fbbf24'], READY: ['rgba(34,197,94,0.12)','#4ade80'],
      SERVED: ['rgba(255,255,255,0.05)','rgba(240,240,248,0.3)'],
    }
    const [bg, col] = map[s] ?? ['rgba(255,255,255,0.05)','rgba(240,240,248,0.3)']
    return (
      <span style={{ fontSize:'0.62rem', padding:'2px 9px', borderRadius:'100px', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.04em', background:bg, color:col }}>
        {s}
      </span>
    )
  }

  return (
    <div style={{ minHeight:'100vh', background:'#04040A', color:'#F0F0F8', fontFamily:'Geist,system-ui,sans-serif', display:'flex', flexDirection:'column' }}>
      {/* Top bar */}
      <div style={{ display:'flex', alignItems:'center', padding:'12px 20px', borderBottom:'1px solid rgba(255,255,255,0.07)', background:'#08080F', gap:'12px' }}>
        <span style={{ fontWeight:'700', fontSize:'0.95rem', letterSpacing:'-0.03em' }}>🍔 Waiter Dashboard</span>
        <div style={{ fontSize:'0.7rem', padding:'4px 11px', borderRadius:'100px', background:connected?'rgba(34,197,94,0.1)':'rgba(232,32,42,0.1)', border:`1px solid ${connected?'rgba(34,197,94,0.25)':'rgba(232,32,42,0.25)'}`, color:connected?'#22c55e':'#f87171', display:'flex', alignItems:'center', gap:'5px' }}>
          <span style={{ width:'6px', height:'6px', borderRadius:'50%', background:connected?'#22c55e':'#f87171', display:'inline-block' }}/>{connected?'Live':'Reconnecting…'}
        </div>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'8px' }}>
          <span style={{ fontSize:'0.72rem', color:'rgba(240,240,248,0.4)' }}>👨‍💼 Waiter</span>
          <button onClick={logout} style={{ padding:'6px 12px', borderRadius:'8px', border:'1px solid rgba(255,255,255,0.1)', background:'transparent', color:'rgba(240,240,248,0.4)', fontSize:'0.75rem', cursor:'pointer', fontFamily:'inherit' }}>Sign Out</button>
        </div>
      </div>

      <div style={{ flex:1, display:'grid', gridTemplateColumns:'320px 1fr', overflow:'hidden' }}>
        {/* Left sidebar - requests */}
        <div style={{ borderRight:'1px solid rgba(255,255,255,0.07)', overflow:'auto', background:'#08080F' }}>
          <div style={{ padding:'14px 16px', borderBottom:'1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontWeight:'600', fontSize:'0.85rem' }}>Requests & Alerts</span>
            {requests.filter(r=>r.status==='OPEN').length > 0 && (
              <span style={{ fontSize:'0.65rem', padding:'3px 9px', borderRadius:'100px', background:'rgba(232,32,42,0.15)', color:'#f87171', fontWeight:'700' }}>
                {requests.filter(r=>r.status==='OPEN').length} Active
              </span>
            )}
          </div>
          <div style={{ padding:'10px' }}>
            {requests.length === 0 ? (
              <div style={{ textAlign:'center', padding:'2rem', color:'rgba(240,240,248,0.25)', fontSize:'0.82rem' }}>
                <div style={{ fontSize:'1.5rem', marginBottom:'0.5rem' }}>✅</div>No active requests
              </div>
            ) : requests.map(r => (
              <div key={r.id} style={{ background:'#0e0e1a', border:'1px solid rgba(232,32,42,0.2)', borderRadius:'12px', padding:'12px', marginBottom:'8px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'5px' }}>
                  <div style={{ fontWeight:'700', fontSize:'0.85rem' }}>Table {r.tableNumber}</div>
                  <span style={{ fontSize:'0.65rem', color:'rgba(240,240,248,0.35)', fontFamily:'monospace' }}>
                    {new Date(r.createdAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
                  </span>
                </div>
                {r.note && <div style={{ fontSize:'0.75rem', color:'rgba(240,240,248,0.6)', marginBottom:'8px', lineHeight:1.5 }}>{r.note}</div>}
                <button onClick={() => resolveRequest(r.id)} style={{ width:'100%', padding:'6px', borderRadius:'7px', border:'1px solid rgba(34,197,94,0.3)', background:'rgba(34,197,94,0.08)', color:'#4ade80', fontSize:'0.72rem', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>
                  ✓ Mark Resolved
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Main area */}
        <div style={{ overflow:'auto', padding:'20px', display:'flex', flexDirection:'column', gap:'20px' }}>
          {/* Table map */}
          <div style={{ background:'#08080F', border:'1px solid rgba(255,255,255,0.07)', borderRadius:'20px', overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontWeight:'600', fontSize:'0.85rem' }}>Restaurant Map</span>
              <div style={{ display:'flex', gap:'10px', fontSize:'0.62rem' }}>
                <span style={{ color:'#4ade80' }}>● Available</span>
                <span style={{ color:'#7dd3fc' }}>● Ordering</span>
                <span style={{ color:'#fbbf24' }}>● Attention</span>
                <span style={{ color:'#f87171' }}>● Waiter</span>
                <span style={{ color:'#c4b5fd' }}>● Ready</span>
              </div>
            </div>
            <div style={{ padding:'16px', display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'8px' }}>
              {Array.from({ length: 20 }, (_, i) => i + 1).map(n => {
                const state = TABLE_STATUS[n] ?? 'available'
                const isSelected = selectedTable === n
                return (
                  <div key={n} onClick={() => setSelectedTable(n === selectedTable ? null : n)}
                    style={{ aspectRatio:'1', borderRadius:'10px', background:TABLE_COLOR[state], border:`1px solid ${isSelected ? TABLE_TEXT[state] : TABLE_BORDER[state]}`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'all 0.2s', transform:isSelected?'scale(1.05)':'scale(1)', boxShadow:isSelected?`0 0 16px ${TABLE_COLOR[state]}`:'none' }}>
                    <div style={{ fontSize:'0.55rem', fontWeight:'700', fontFamily:'monospace', opacity:0.6, marginBottom:'2px' }}>T{n}</div>
                    <div style={{ fontSize:'1.1rem' }}>{TABLE_ICON[state]}</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Live orders */}
          <div style={{ background:'#08080F', border:'1px solid rgba(255,255,255,0.07)', borderRadius:'20px', overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontWeight:'600', fontSize:'0.85rem' }}>Live Orders</span>
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ fontSize:'0.65rem', color:'rgba(240,240,248,0.3)', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    <th style={{ padding:'8px 18px', textAlign:'left', fontWeight:'500' }}>#</th>
                    <th style={{ padding:'8px', textAlign:'left', fontWeight:'500' }}>Table</th>
                    <th style={{ padding:'8px', textAlign:'left', fontWeight:'500' }}>Items</th>
                    <th style={{ padding:'8px', textAlign:'right', fontWeight:'500' }}>Total</th>
                    <th style={{ padding:'8px', textAlign:'center', fontWeight:'500' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 15).map(o => (
                    <tr key={o.id} style={{ borderTop:'1px solid rgba(255,255,255,0.04)', fontSize:'0.8rem' }}
                      onMouseOver={e => (e.currentTarget.style.background='rgba(255,255,255,0.015)')}
                      onMouseOut={e => (e.currentTarget.style.background='transparent')}>
                      <td style={{ padding:'10px 18px', fontFamily:'monospace', fontSize:'0.72rem', color:'rgba(240,240,248,0.4)' }}>#{o.orderNumber}</td>
                      <td style={{ padding:'10px 8px', fontWeight:'600' }}>Table {o.tableNumber}</td>
                      <td style={{ padding:'10px 8px', color:'rgba(240,240,248,0.6)', maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {o.items?.map(i => `${i.name} ×${i.quantity}`).join(', ')}
                      </td>
                      <td style={{ padding:'10px 8px', textAlign:'right', fontWeight:'700', color:'#E8202A', fontFamily:'monospace' }}>
                        {typeof o.total === 'number' ? o.total.toFixed(3) : o.total} JOD
                      </td>
                      <td style={{ padding:'10px 8px', textAlign:'center' }}>{statusPill(o.status)}</td>
                    </tr>
                  ))}
                  {orders.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign:'center', padding:'2rem', color:'rgba(240,240,248,0.25)', fontSize:'0.82rem' }}>No orders yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
