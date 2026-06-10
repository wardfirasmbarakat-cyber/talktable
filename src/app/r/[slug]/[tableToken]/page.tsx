'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Language = 'en' | 'ar'
type Screen = 'loading' | 'landing' | 'menu' | 'ai_chat' | 'cart' | 'order_tracking'

interface Allergen { id: string; name: string; emoji: string | null }
interface Ingredient { id: string; name: string; nameAr: string | null }

interface MenuItem {
  id: string
  name: string
  nameAr: string | null
  description: string | null
  descriptionAr: string | null
  price: number
  imageUrl: string | null
  emoji: string | null
  calories: number | null
  isFeatured: boolean
  isPopular: boolean
  categoryId: string
  allergens: Allergen[]
  ingredients: Ingredient[]
}

interface Category {
  id: string
  name: string
  nameAr: string | null
  emoji: string | null
  sortOrder: number
  menuItems: MenuItem[]
}

interface RestaurantInfo {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  currency: string
  isActive: boolean
}

interface TableInfo {
  id: string
  number: number
  label: string | null
}

interface PageData {
  restaurant: RestaurantInfo
  table: TableInfo
  categories: Category[]
}

interface CartItem {
  menuItem: MenuItem
  quantity: number
  notes: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface OrderResult {
  orderId: string
  orderNumber: number
  total: number
  status: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const C = {
  bg: '#04040A',
  card: '#0C0C18',
  cardBorder: 'rgba(255,255,255,0.07)',
  orange: '#FF6B00',
  orangeLight: '#FF8C3A',
  orangeDim: 'rgba(255,107,0,0.15)',
  text: '#F0F0F8',
  textMuted: 'rgba(240,240,248,0.5)',
  textDim: 'rgba(240,240,248,0.3)',
  surface: '#0F0F1E',
  green: '#22C55E',
  red: '#EF4444',
}

const ORDER_STATUSES = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED']
const STATUS_LABELS: Record<string, { en: string; ar: string }> = {
  PENDING: { en: 'Received', ar: 'تم الاستلام' },
  ACCEPTED: { en: 'Accepted', ar: 'تم القبول' },
  PREPARING: { en: 'Preparing', ar: 'جاري التحضير' },
  READY: { en: 'Ready!', ar: 'جاهز!' },
  SERVED: { en: 'Served', ar: 'تم التقديم' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(price: number, currency = 'JOD'): string {
  return `${price.toFixed(3)} ${currency}`
}

function t(en: string, ar: string, lang: Language) {
  return lang === 'ar' ? ar : en
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.5rem' }}>
      <div style={{ fontSize: '3rem', animation: 'pulse 1.5s ease-in-out infinite' }}>🍔</div>
      <div style={{ display: 'flex', gap: '6px' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: '50%', background: C.orange,
            animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
      <style>{`
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.1)} }
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-10px)} }
        @keyframes slideUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,107,0,0.3); border-radius: 4px; }
      `}</style>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TablePage({ params: paramsPromise }: { params: Promise<{ slug: string; tableToken: string }> }) {
  const params = React.use(paramsPromise)
  const [screen, setScreen] = useState<Screen>('loading')
  const [lang, setLang] = useState<Language>('en')
  const [data, setData] = useState<PageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [kitchenNote, setKitchenNote] = useState('')
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null)
  const [orderStatus, setOrderStatus] = useState<string>('PENDING')
  const [placingOrder, setPlacingOrder] = useState(false)
  const [waiterSent, setWaiterSent] = useState<string | null>(null)
  const [itemQty, setItemQty] = useState(1)
  const [itemNote, setItemNote] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const socketRef = useRef<ReturnType<typeof import('socket.io-client').io> | null>(null)

  // ── Fetch table/menu data ────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/r/${params.tableToken}`)
      .then(r => r.json())
      .then((d: PageData & { error?: string }) => {
        if (d.error) { setError(d.error); setScreen('landing'); return }
        setData(d)
        setScreen('landing')
      })
      .catch(() => { setError('Failed to load. Check your connection.'); setScreen('landing') })
  }, [params.tableToken])

  // ── Socket.io for order tracking ─────────────────────────────────────────
  useEffect(() => {
    if (screen !== 'order_tracking' || !data || !orderResult) return

    let socket: ReturnType<typeof import('socket.io-client').io>
    import('socket.io-client').then(({ io }) => {
      socket = io(window.location.origin, { transports: ['websocket', 'polling'] })
      socketRef.current = socket
      socket.emit('join:table', params.tableToken)
      socket.on('order:status', (payload: { orderId: string; status: string }) => {
        if (payload.orderId === orderResult.orderId) {
          setOrderStatus(payload.status)
        }
      })
    }).catch(console.error)

    return () => { socket?.disconnect(); socketRef.current = null }
  }, [screen, data, orderResult, params.tableToken])

  // ── Chat scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // ── AI chat initial greeting ─────────────────────────────────────────────
  useEffect(() => {
    if (screen === 'ai_chat' && chatMessages.length === 0) {
      setChatMessages([{
        role: 'assistant',
        content: lang === 'ar'
          ? `مرحباً! أنا المساعد الذكي لمطعم ${data?.restaurant.name ?? 'فايرفلاي'}. كيف أستطيع مساعدتك اليوم؟ يمكنني مساعدتك في اختيار الوجبات والإجابة على أسئلتك حول المكونات والحساسية أو أخذ طلبك! 😊`
          : `Hi! I'm ${data?.restaurant.name ?? 'Firefly'}'s AI assistant. How can I help you today? I can help you choose from our menu, answer questions about ingredients and allergens, or take your order! 😊`,
        timestamp: new Date(),
      }])
    }
  }, [screen, lang, data, chatMessages.length])

  // ── Derived ──────────────────────────────────────────────────────────────
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0)
  const cartTotal = cart.reduce((s, i) => s + i.menuItem.price * i.quantity, 0)
  const currency = data?.restaurant.currency ?? 'JOD'

  const filteredItems: MenuItem[] = activeCategory === 'all'
    ? (data?.categories.flatMap(c => c.menuItems) ?? [])
    : (data?.categories.find(c => c.id === activeCategory)?.menuItems ?? [])

  const addToCart = useCallback((item: MenuItem, qty: number, notes: string) => {
    setCart(prev => {
      const idx = prev.findIndex(ci => ci.menuItem.id === item.id && ci.notes === notes)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantity: next[idx].quantity + qty }
        return next
      }
      return [...prev, { menuItem: item, quantity: qty, notes }]
    })
    setSelectedItem(null)
    setItemQty(1)
    setItemNote('')
  }, [])

  const updateCartQty = useCallback((idx: number, delta: number) => {
    setCart(prev => {
      const next = [...prev]
      const newQty = next[idx].quantity + delta
      if (newQty <= 0) return next.filter((_, i) => i !== idx)
      next[idx] = { ...next[idx], quantity: newQty }
      return next
    })
  }, [])

  const removeFromCart = useCallback((idx: number) => {
    setCart(prev => prev.filter((_, i) => i !== idx))
  }, [])

  const cartCountForItem = (id: string) =>
    cart.filter(ci => ci.menuItem.id === id).reduce((s, ci) => s + ci.quantity, 0)

  const sendChat = useCallback(async () => {
    const text = chatInput.trim()
    if (!text || chatLoading) return
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date() }
    setChatMessages(prev => [...prev, userMsg])
    setChatInput('')
    setChatLoading(true)
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableToken: params.tableToken,
          messages: [...chatMessages, userMsg].map(m => ({ role: m.role, content: m.content })),
          language: lang,
        }),
      })
      const json = await res.json()
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: json.message ?? json.error ?? 'Sorry, something went wrong.',
        timestamp: new Date(),
      }])
    } catch {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: lang === 'ar' ? 'عذراً، حدث خطأ. حاول مجدداً.' : 'Sorry, something went wrong. Please try again.',
        timestamp: new Date(),
      }])
    } finally {
      setChatLoading(false)
    }
  }, [chatInput, chatLoading, chatMessages, params.tableToken, lang])

  const placeOrder = useCallback(async () => {
    if (cart.length === 0 || placingOrder) return
    setPlacingOrder(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableToken: params.tableToken,
          items: cart.map(ci => ({ menuItemId: ci.menuItem.id, quantity: ci.quantity, notes: ci.notes || undefined })),
          notes: kitchenNote || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) { alert(json.error ?? 'Failed to place order'); return }
      setOrderResult(json)
      setOrderStatus(json.status)
      setCart([])
      setKitchenNote('')
      setScreen('order_tracking')
    } catch {
      alert(lang === 'ar' ? 'فشل الاتصال. تحقق من الإنترنت.' : 'Connection failed. Check your internet.')
    } finally {
      setPlacingOrder(false)
    }
  }, [cart, placingOrder, params.tableToken, kitchenNote, lang])

  const sendWaiterRequest = useCallback(async (type: string) => {
    try {
      const res = await fetch('/api/waiter-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableToken: params.tableToken, type }),
      })
      if (res.ok) {
        setWaiterSent(type)
        setTimeout(() => setWaiterSent(null), 3000)
      }
    } catch { /* non-fatal */ }
  }, [params.tableToken])

  // ── Styles helpers ───────────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    background: C.card,
    border: `1px solid ${C.cardBorder}`,
    borderRadius: '16px',
    padding: '1rem',
  }

  const btnOrange: React.CSSProperties = {
    background: `linear-gradient(135deg, ${C.orange}, ${C.orangeLight})`,
    color: '#fff',
    border: 'none',
    borderRadius: '14px',
    padding: '14px 24px',
    fontSize: '1rem',
    fontWeight: '700',
    cursor: 'pointer',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    boxShadow: `0 4px 20px rgba(255,107,0,0.35)`,
    transition: 'opacity 0.15s',
  }

  const btnOutline: React.CSSProperties = {
    background: 'transparent',
    color: C.text,
    border: `1.5px solid rgba(255,255,255,0.18)`,
    borderRadius: '14px',
    padding: '14px 24px',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'border-color 0.15s',
  }

  const screenWrap: React.CSSProperties = {
    minHeight: '100vh',
    background: C.bg,
    color: C.text,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    maxWidth: '600px',
    margin: '0 auto',
    position: 'relative',
    direction: lang === 'ar' ? 'rtl' : 'ltr',
  }

  // ── RENDER: loading ──────────────────────────────────────────────────────
  if (screen === 'loading') return <LoadingScreen />

  // ── RENDER: error ────────────────────────────────────────────────────────
  if (error && !data) {
    return (
      <div style={{ ...screenWrap, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ marginBottom: '0.5rem' }}>Oops!</h2>
        <p style={{ color: C.textMuted, marginBottom: '1.5rem' }}>{error}</p>
        <button style={btnOrange} onClick={() => window.location.reload()}>Try Again</button>
      </div>
    )
  }

  const restaurant = data!.restaurant
  const table = data!.table
  const tableLabel = table.label ?? `Table ${table.number}`

  // ──────────────────────────────────────────────────────────────────────────
  // SCREEN: LANDING
  // ──────────────────────────────────────────────────────────────────────────
  if (screen === 'landing') {
    return (
      <div style={{ ...screenWrap, display: 'flex', flexDirection: 'column', minHeight: '100vh', padding: '0 0 2rem' }}>
        <GlobalStyles />
        {/* Hero gradient */}
        <div style={{ background: `radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255,107,0,0.18) 0%, transparent 70%)`, padding: '3rem 1.5rem 1.5rem', textAlign: 'center', animation: 'slideUp 0.5s ease' }}>
          <div style={{ fontSize: '4rem', marginBottom: '0.75rem', filter: 'drop-shadow(0 0 20px rgba(255,107,0,0.5))' }}>🍔</div>
          <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.8rem', fontWeight: '800', letterSpacing: '-0.03em' }}>{restaurant.name}</h1>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: C.orangeDim, border: `1px solid ${C.orange}`, borderRadius: '20px', padding: '4px 14px', marginTop: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', color: C.orange, fontWeight: '700' }}>
              {t(tableLabel, `طاولة ${table.number}`, lang)}
            </span>
          </div>
        </div>

        {/* Welcome card */}
        <div style={{ padding: '0 1.25rem', animation: 'slideUp 0.6s ease 0.1s both' }}>
          <div style={{ ...cardStyle, textAlign: 'center', marginBottom: '1rem', padding: '1.5rem' }}>
            <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: '500', lineHeight: '1.6' }}>
              {t(`Welcome to ${restaurant.name}! 👋`, `مرحباً بك في ${restaurant.name}! 👋`, lang)}
            </p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: C.textMuted }}>
              {t('Scan, order, and enjoy your meal.', 'امسح وأطلب واستمتع بوجبتك.', lang)}
            </p>
          </div>

          {/* Language toggle */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', justifyContent: 'center' }}>
            {(['en', 'ar'] as Language[]).map(l => (
              <button key={l} onClick={() => setLang(l)} style={{
                background: lang === l ? C.orange : 'transparent',
                color: lang === l ? '#fff' : C.textMuted,
                border: `1.5px solid ${lang === l ? C.orange : 'rgba(255,255,255,0.15)'}`,
                borderRadius: '10px', padding: '6px 20px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s',
              }}>
                {l === 'en' ? 'English' : 'العربية'}
              </button>
            ))}
          </div>

          {/* CTAs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button style={btnOrange} onClick={() => setScreen('ai_chat')}>
              🤖 {t('Ask AI Assistant', 'اسأل المساعد الذكي', lang)}
            </button>
            <button style={btnOutline} onClick={() => setScreen('menu')}>
              📋 {t('Browse Menu & Order', 'تصفح القائمة وأطلب', lang)}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 'auto', textAlign: 'center', padding: '2rem 1rem 0' }}>
          <p style={{ margin: 0, fontSize: '0.72rem', color: C.textDim }}>
            {t('Powered by TalkTable', 'مدعوم من TalkTable', lang)}
          </p>
        </div>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCREEN: AI CHAT
  // ──────────────────────────────────────────────────────────────────────────
  if (screen === 'ai_chat') {
    return (
      <div style={{ ...screenWrap, display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <GlobalStyles />
        {/* Header */}
        <div style={{ background: C.card, borderBottom: `1px solid ${C.cardBorder}`, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <button onClick={() => setScreen('landing')} style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: '1.3rem', cursor: 'pointer', padding: '4px', lineHeight: 1 }}>←</button>
          <div style={{ width: 36, height: 36, borderRadius: '10px', background: `linear-gradient(135deg, ${C.orange}, ${C.orangeLight})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>🤖</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>{t('AI Assistant', 'المساعد الذكي', lang)}</div>
            <div style={{ fontSize: '0.72rem', color: C.green }}>● {t('Online', 'متصل', lang)}</div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['en', 'ar'] as Language[]).map(l => (
              <button key={l} onClick={() => setLang(l)} style={{
                background: lang === l ? C.orange : 'transparent',
                color: lang === l ? '#fff' : C.textMuted,
                border: `1px solid ${lang === l ? C.orange : 'rgba(255,255,255,0.12)'}`,
                borderRadius: '8px', padding: '4px 10px', fontSize: '0.72rem', fontWeight: '600', cursor: 'pointer',
              }}>{l === 'en' ? 'EN' : 'ع'}</button>
            ))}
          </div>
          <button onClick={() => setScreen('menu')} style={{ background: C.orangeDim, border: `1px solid ${C.orange}`, color: C.orange, borderRadius: '10px', padding: '6px 12px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            📋 {t('Menu', 'القائمة', lang)}
          </button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {chatMessages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: '10px', alignItems: 'flex-end', animation: 'slideUp 0.3s ease' }}>
              {msg.role === 'assistant' && (
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, ${C.orange}, ${C.orangeLight})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', flexShrink: 0 }}>🤖</div>
              )}
              <div style={{ maxWidth: '75%' }}>
                <div style={{
                  background: msg.role === 'user' ? `linear-gradient(135deg, ${C.orange}, ${C.orangeLight})` : C.card,
                  border: msg.role === 'user' ? 'none' : `1px solid ${C.cardBorder}`,
                  borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  padding: '10px 14px',
                  fontSize: '0.9rem',
                  lineHeight: '1.5',
                  color: C.text,
                  whiteSpace: 'pre-wrap',
                }}>{msg.content}</div>
                <div style={{ fontSize: '0.65rem', color: C.textDim, marginTop: '4px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))}
          {chatLoading && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: `linear-gradient(135deg, ${C.orange}, ${C.orangeLight})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>🤖</div>
              <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: '18px 18px 18px 4px', padding: '12px 16px', display: 'flex', gap: '5px', alignItems: 'center' }}>
                {[0, 1, 2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: C.orange, animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div style={{ background: C.card, borderTop: `1px solid ${C.cardBorder}`, padding: '0.75rem 1.25rem', display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
          <VoiceButton onTranscript={setChatInput} lang={lang} />
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
            placeholder={t('Type a message…', 'اكتب رسالة…', lang)}
            style={{ flex: 1, background: C.surface, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: '12px', padding: '10px 14px', color: C.text, fontSize: '0.9rem', outline: 'none' }}
          />
          <button onClick={sendChat} disabled={!chatInput.trim() || chatLoading} style={{ background: C.orange, border: 'none', borderRadius: '12px', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, opacity: (!chatInput.trim() || chatLoading) ? 0.5 : 1 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCREEN: MENU
  // ──────────────────────────────────────────────────────────────────────────
  if (screen === 'menu') {
    const categories = data!.categories
    return (
      <div style={{ ...screenWrap, paddingBottom: cartCount > 0 ? '80px' : '16px' }}>
        <GlobalStyles />
        {/* Header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 50, background: C.bg, borderBottom: `1px solid ${C.cardBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1rem 1.25rem' }}>
            <button onClick={() => setScreen('landing')} style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: '1.3rem', cursor: 'pointer', padding: '4px', lineHeight: 1 }}>←</button>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: '700' }}>{t('Menu', 'القائمة', lang)}</div>
              <div style={{ fontSize: '0.72rem', color: C.textMuted }}>{restaurant.name}</div>
            </div>
            {cartCount > 0 && (
              <button onClick={() => setScreen('cart')} style={{ background: C.orange, border: 'none', borderRadius: '12px', padding: '8px 16px', color: '#fff', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🛒 {cartCount}
              </button>
            )}
          </div>
          {/* Category tabs */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', padding: '0 1.25rem 0.75rem', scrollbarWidth: 'none' }}>
            <CategoryTab id="all" label={t('All', 'الكل', lang)} emoji="🍽️" active={activeCategory === 'all'} onClick={() => setActiveCategory('all')} />
            {categories.map(cat => (
              <CategoryTab key={cat.id} id={cat.id} label={lang === 'ar' && cat.nameAr ? cat.nameAr : cat.name} emoji={cat.emoji ?? '🍽️'} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)} />
            ))}
          </div>
        </div>

        {/* Grid */}
        <div style={{ padding: '1rem 1.25rem', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
          {filteredItems.map(item => {
            const inCart = cartCountForItem(item.id)
            return (
              <div key={item.id} onClick={() => { setSelectedItem(item); setItemQty(1); setItemNote('') }} style={{ ...cardStyle, cursor: 'pointer', padding: '0', overflow: 'hidden', transition: 'transform 0.15s', position: 'relative' }}>
                {/* Image / emoji */}
                <div style={{ background: `linear-gradient(135deg, #0F0F20, #151530)`, height: '110px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', position: 'relative' }}>
                  {item.imageUrl
                    ? <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
                    : item.emoji ?? '🍽️'}
                  {item.isPopular && <div style={{ position: 'absolute', top: '6px', left: '6px', background: C.orange, color: '#fff', fontSize: '0.6rem', fontWeight: '800', padding: '2px 8px', borderRadius: '8px' }}>{t('POPULAR', 'الأكثر طلباً', lang)}</div>}
                  {inCart > 0 && <div style={{ position: 'absolute', top: '6px', right: '6px', background: C.green, color: '#fff', fontSize: '0.7rem', fontWeight: '800', width: '22px', height: '22px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inCart}</div>}
                </div>
                <div style={{ padding: '10px' }}>
                  <div style={{ fontWeight: '700', fontSize: '0.85rem', marginBottom: '4px', lineHeight: '1.3' }}>
                    {lang === 'ar' && item.nameAr ? item.nameAr : item.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: C.orange, fontWeight: '700', fontSize: '0.8rem' }}>{fmt(item.price, currency)}</span>
                    {item.calories && <span style={{ color: C.textDim, fontSize: '0.68rem' }}>{item.calories} cal</span>}
                  </div>
                  {item.allergens.length > 0 && (
                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginTop: '6px' }}>
                      {item.allergens.slice(0, 4).map(a => (
                        <span key={a.id} title={a.name} style={{ fontSize: '0.85rem' }}>{a.emoji ?? '⚠️'}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Item detail bottom sheet */}
        {selectedItem && (
          <ItemSheet
            item={selectedItem}
            lang={lang}
            currency={currency}
            qty={itemQty}
            note={itemNote}
            onQty={setItemQty}
            onNote={setItemNote}
            onClose={() => { setSelectedItem(null); setItemQty(1); setItemNote('') }}
            onAdd={() => addToCart(selectedItem, itemQty, itemNote)}
          />
        )}

        {/* Cart float bar */}
        {cartCount > 0 && (
          <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '600px', padding: '0.75rem 1.25rem 1rem', background: `linear-gradient(to top, ${C.bg} 60%, transparent)`, zIndex: 40 }}>
            <button onClick={() => setScreen('cart')} style={{ ...btnOrange, justifyContent: 'space-between' }}>
              <span>🛒 {t(`View Cart (${cartCount} items)`, `عرض السلة (${cartCount} عناصر)`, lang)}</span>
              <span>{fmt(cartTotal, currency)}</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCREEN: CART
  // ──────────────────────────────────────────────────────────────────────────
  if (screen === 'cart') {
    return (
      <div style={{ ...screenWrap, paddingBottom: '100px' }}>
        <GlobalStyles />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1rem 1.25rem', borderBottom: `1px solid ${C.cardBorder}` }}>
          <button onClick={() => setScreen('menu')} style={{ background: 'none', border: 'none', color: C.textMuted, fontSize: '1.3rem', cursor: 'pointer', padding: '4px', lineHeight: 1 }}>←</button>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>{t('Your Order', 'طلبك', lang)}</h2>
          <div style={{ marginLeft: 'auto', background: C.orangeDim, color: C.orange, borderRadius: '10px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: '700' }}>{cartCount} {t('items', 'عناصر', lang)}</div>
        </div>

        <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛒</div>
              <p style={{ color: C.textMuted }}>{t('Your cart is empty', 'سلتك فارغة', lang)}</p>
              <button style={{ ...btnOrange, marginTop: '1rem' }} onClick={() => setScreen('menu')}>{t('Browse Menu', 'تصفح القائمة', lang)}</button>
            </div>
          ) : (
            <>
              {cart.map((ci, idx) => (
                <div key={idx} style={{ ...cardStyle, display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '1.8rem', flexShrink: 0, width: '44px', textAlign: 'center' }}>{ci.menuItem.emoji ?? '🍽️'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: ci.notes ? '4px' : 0 }}>
                      {lang === 'ar' && ci.menuItem.nameAr ? ci.menuItem.nameAr : ci.menuItem.name}
                    </div>
                    {ci.notes && <div style={{ fontSize: '0.75rem', color: C.textMuted, marginBottom: '8px', fontStyle: 'italic' }}>{ci.notes}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <QtyControl qty={ci.quantity} onDec={() => updateCartQty(idx, -1)} onInc={() => updateCartQty(idx, 1)} />
                      <span style={{ color: C.orange, fontWeight: '700', fontSize: '0.85rem', marginLeft: 'auto' }}>{fmt(ci.menuItem.price * ci.quantity, currency)}</span>
                    </div>
                  </div>
                  <button onClick={() => removeFromCart(idx)} style={{ background: 'none', border: 'none', color: C.red, fontSize: '1.1rem', cursor: 'pointer', padding: '2px', flexShrink: 0 }}>✕</button>
                </div>
              ))}

              {/* Special instructions */}
              <div style={cardStyle}>
                <label style={{ fontSize: '0.85rem', fontWeight: '600', display: 'block', marginBottom: '8px' }}>
                  💬 {t('Special instructions for the kitchen', 'تعليمات خاصة للمطبخ', lang)}
                </label>
                <textarea
                  value={kitchenNote}
                  onChange={e => setKitchenNote(e.target.value)}
                  placeholder={t('e.g. No onions, extra sauce…', 'مثال: بدون بصل، صوص إضافي…', lang)}
                  rows={3}
                  style={{ width: '100%', background: C.surface, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: '10px', padding: '10px 12px', color: C.text, fontSize: '0.85rem', resize: 'none', outline: 'none' }}
                />
              </div>

              {/* Summary */}
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: C.textMuted, fontSize: '0.85rem' }}>
                  <span>{t('Subtotal', 'المجموع الفرعي', lang)}</span>
                  <span>{fmt(cartTotal, currency)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', fontSize: '1rem', paddingTop: '8px', borderTop: `1px solid ${C.cardBorder}` }}>
                  <span>{t('Total', 'الإجمالي', lang)}</span>
                  <span style={{ color: C.orange }}>{fmt(cartTotal, currency)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {cart.length > 0 && (
          <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '600px', padding: '0.75rem 1.25rem 1rem', background: `linear-gradient(to top, ${C.bg} 60%, transparent)` }}>
            <button style={{ ...btnOrange, opacity: placingOrder ? 0.7 : 1 }} onClick={placeOrder} disabled={placingOrder}>
              {placingOrder ? <><SpinnerDots />{t('Placing Order…', 'جاري الطلب…', lang)}</> : `✅ ${t('Place Order', 'تأكيد الطلب', lang)}`}
            </button>
          </div>
        )}
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCREEN: ORDER TRACKING
  // ──────────────────────────────────────────────────────────────────────────
  if (screen === 'order_tracking' && orderResult) {
    const statusIdx = ORDER_STATUSES.indexOf(orderStatus)
    const waiterActions = [
      { type: 'CALL_WAITER', icon: '🙋', en: 'Call Waiter', ar: 'نادِ النادل' },
      { type: 'REQUEST_BILL', icon: '💳', en: 'Request Bill', ar: 'اطلب الفاتورة' },
      { type: 'WATER_REFILL', icon: '💧', en: 'Water Refill', ar: 'إعادة ملء الماء' },
      { type: 'ASSISTANCE', icon: '❓', en: 'Need Assistance', ar: 'تحتاج مساعدة' },
    ]

    return (
      <div style={{ ...screenWrap, paddingBottom: '2rem' }}>
        <GlobalStyles />
        {/* Header */}
        <div style={{ background: `radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,107,0,0.15) 0%, transparent 70%)`, padding: '2rem 1.25rem 1.5rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎉</div>
          <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.3rem', fontWeight: '800' }}>
            {t('Order Placed!', 'تم الطلب!', lang)}
          </h2>
          <p style={{ margin: '0 0 0.5rem', color: C.textMuted, fontSize: '0.9rem' }}>
            {t(`Order #${orderResult.orderNumber}`, `طلب رقم ${orderResult.orderNumber}#`, lang)}
          </p>
          <div style={{ display: 'inline-block', background: C.orangeDim, border: `1px solid ${C.orange}`, borderRadius: '10px', padding: '6px 16px', fontSize: '0.85rem', color: C.orange, fontWeight: '700' }}>
            {tableLabel}
          </div>
        </div>

        <div style={{ padding: '0 1.25rem', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Progress tracker */}
          <div style={cardStyle}>
            <div style={{ fontWeight: '700', marginBottom: '1rem', fontSize: '0.9rem' }}>
              {t('Order Status', 'حالة الطلب', lang)}
            </div>
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              {/* Progress line */}
              <div style={{ position: 'absolute', top: '13px', left: '13px', right: '13px', height: '2px', background: 'rgba(255,255,255,0.08)', zIndex: 0 }} />
              <div style={{ position: 'absolute', top: '13px', left: '13px', height: '2px', background: C.orange, zIndex: 1, transition: 'width 0.8s ease', width: statusIdx >= 0 ? `calc(${(statusIdx / (ORDER_STATUSES.length - 1)) * 100}% - 0px)` : '0%' }} />
              {ORDER_STATUSES.map((s, i) => {
                const done = i <= statusIdx
                const current = i === statusIdx
                return (
                  <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 1, position: 'relative', zIndex: 2 }}>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: done ? C.orange : C.surface, border: `2px solid ${done ? C.orange : 'rgba(255,255,255,0.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', transition: 'all 0.4s', boxShadow: current ? `0 0 12px ${C.orange}` : 'none' }}>
                      {done ? '✓' : i + 1}
                    </div>
                    <div style={{ fontSize: '0.6rem', fontWeight: done ? '700' : '500', color: done ? C.text : C.textDim, textAlign: 'center', lineHeight: '1.3' }}>
                      {STATUS_LABELS[s][lang]}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Total */}
          <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: C.textMuted, fontSize: '0.9rem' }}>{t('Total Paid', 'المبلغ الإجمالي', lang)}</span>
            <span style={{ fontWeight: '800', fontSize: '1.1rem', color: C.orange }}>{fmt(Number(orderResult.total), currency)}</span>
          </div>

          {/* Waiter request buttons */}
          <div>
            <div style={{ fontWeight: '700', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
              {t('Need something?', 'تحتاج شيئاً؟', lang)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {waiterActions.map(a => {
                const isSent = waiterSent === a.type
                return (
                  <button key={a.type} onClick={() => sendWaiterRequest(a.type)} style={{
                    background: isSent ? C.green : C.card,
                    border: `1px solid ${isSent ? C.green : C.cardBorder}`,
                    borderRadius: '12px', padding: '14px 10px', color: C.text, cursor: 'pointer', transition: 'all 0.3s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                  }}>
                    <span style={{ fontSize: '1.4rem' }}>{a.icon}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: '600' }}>{t(a.en, a.ar, lang)}</span>
                    {isSent && <span style={{ fontSize: '0.65rem', color: C.green }}>✓ {t('Sent!', 'أُرسل!', lang)}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* New order */}
          <button style={btnOutline} onClick={() => { setOrderResult(null); setScreen('menu') }}>
            ➕ {t('Add Another Order', 'طلب إضافي', lang)}
          </button>
        </div>
      </div>
    )
  }

  return null
}

// ── Helper Components ─────────────────────────────────────────────────────────

function CategoryTab({ id, label, emoji, active, onClick }: { id: string; label: string; emoji: string; active: boolean; onClick: () => void }) {
  void id
  return (
    <button onClick={onClick} style={{
      background: active ? C.orange : C.card,
      border: `1px solid ${active ? C.orange : C.cardBorder}`,
      borderRadius: '12px', padding: '6px 14px', color: active ? '#fff' : C.textMuted,
      fontWeight: active ? '700' : '500', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap',
      display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, transition: 'all 0.2s',
    }}>
      <span>{emoji}</span><span>{label}</span>
    </button>
  )
}

function QtyControl({ qty, onDec, onInc }: { qty: number; onDec: () => void; onInc: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <button onClick={onDec} style={{ width: 28, height: 28, borderRadius: '8px', background: C.surface, border: `1px solid rgba(255,255,255,0.1)`, color: C.text, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
      <span style={{ fontWeight: '700', fontSize: '0.95rem', minWidth: '20px', textAlign: 'center' }}>{qty}</span>
      <button onClick={onInc} style={{ width: 28, height: 28, borderRadius: '8px', background: C.orange, border: 'none', color: '#fff', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
    </div>
  )
}

function SpinnerDots() {
  return (
    <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', marginRight: '8px' }}>
      {[0, 1, 2].map(i => <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff', animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />)}
    </span>
  )
}

function ItemSheet({ item, lang, currency, qty, note, onQty, onNote, onClose, onAdd }: {
  item: MenuItem; lang: Language; currency: string
  qty: number; note: string
  onQty: (n: number) => void; onNote: (s: string) => void
  onClose: () => void; onAdd: () => void
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '600px', background: C.card, borderRadius: '24px 24px 0 0', zIndex: 101, maxHeight: '90vh', overflowY: 'auto', animation: 'slideUp 0.3s ease', direction: lang === 'ar' ? 'rtl' : 'ltr' }}>
        {/* Image / emoji header */}
        <div style={{ background: `linear-gradient(135deg, #0F0F20, #151530)`, height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '4rem', position: 'relative', borderRadius: '24px 24px 0 0' }}>
          {item.imageUrl
            ? <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '24px 24px 0 0' }} />
            : item.emoji ?? '🍽️'}
          <button onClick={onClose} style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: 32, height: 32, color: '#fff', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
        <div style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', flex: 1 }}>
              {lang === 'ar' && item.nameAr ? item.nameAr : item.name}
            </h3>
            <span style={{ color: C.orange, fontWeight: '800', fontSize: '1rem', whiteSpace: 'nowrap' }}>{fmt(item.price, currency)}</span>
          </div>

          {item.calories && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '4px 10px', marginBottom: '0.75rem', fontSize: '0.78rem', color: C.textMuted }}>
              🔥 {item.calories} {lang === 'ar' ? 'سعرة' : 'calories'}
            </div>
          )}

          {(item.description || item.descriptionAr) && (
            <p style={{ color: C.textMuted, fontSize: '0.85rem', lineHeight: '1.6', marginBottom: '1rem' }}>
              {lang === 'ar' && item.descriptionAr ? item.descriptionAr : item.description}
            </p>
          )}

          {item.ingredients.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: '600', fontSize: '0.8rem', marginBottom: '6px', color: C.textMuted }}>
                {lang === 'ar' ? 'المكونات' : 'Ingredients'}
              </div>
              <p style={{ margin: 0, fontSize: '0.82rem', color: C.textMuted, lineHeight: '1.6' }}>
                {item.ingredients.map(i => lang === 'ar' && i.nameAr ? i.nameAr : i.name).join(' · ')}
              </p>
            </div>
          )}

          {item.allergens.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: '600', fontSize: '0.8rem', marginBottom: '6px', color: C.textMuted }}>
                {lang === 'ar' ? 'مسببات الحساسية' : 'Allergens'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {item.allergens.map(a => (
                  <span key={a.id} style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '3px 10px', fontSize: '0.75rem', color: '#FCA5A5' }}>
                    {a.emoji && `${a.emoji} `}{a.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Note */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: '600', display: 'block', marginBottom: '6px', color: C.textMuted }}>
              {lang === 'ar' ? 'ملاحظات (اختياري)' : 'Notes (optional)'}
            </label>
            <textarea
              value={note}
              onChange={e => onNote(e.target.value)}
              placeholder={lang === 'ar' ? 'مثال: بدون بصل' : 'e.g. No onions'}
              rows={2}
              style={{ width: '100%', background: C.surface, border: `1px solid rgba(255,255,255,0.1)`, borderRadius: '10px', padding: '10px 12px', color: C.text, fontSize: '0.85rem', resize: 'none', outline: 'none' }}
            />
          </div>

          {/* Qty + add */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <QtyControl qty={qty} onDec={() => onQty(Math.max(1, qty - 1))} onInc={() => onQty(qty + 1)} />
            <button onClick={onAdd} style={{ flex: 1, background: `linear-gradient(135deg, ${C.orange}, ${C.orangeLight})`, border: 'none', borderRadius: '14px', padding: '14px', color: '#fff', fontWeight: '700', fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              🛒 {lang === 'ar' ? `أضف للسلة — ${fmt(item.price * qty, currency)}` : `Add to Cart — ${fmt(item.price * qty, currency)}`}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any

function VoiceButton({ onTranscript, lang }: { onTranscript: (t: string) => void; lang: Language }) {
  const [listening, setListening] = useState(false)
  const recRef = useRef<AnySpeechRecognition>(null)

  const toggle = () => {
    const win = window as Window & typeof globalThis & { SpeechRecognition?: AnySpeechRecognition; webkitSpeechRecognition?: AnySpeechRecognition }
    const SpeechRec = win.SpeechRecognition ?? win.webkitSpeechRecognition
    if (!SpeechRec) return

    if (listening) {
      recRef.current?.stop()
      setListening(false)
      return
    }

    const rec = new SpeechRec()
    rec.lang = lang === 'ar' ? 'ar-JO' : 'en-US'
    rec.interimResults = false
    rec.onresult = (e: AnySpeechRecognition) => {
      const transcript = e.results[0][0].transcript
      onTranscript(transcript)
    }
    rec.onend = () => setListening(false)
    rec.start()
    recRef.current = rec
    setListening(true)
  }

  return (
    <button onClick={toggle} style={{ background: listening ? 'rgba(239,68,68,0.15)' : C.surface, border: `1px solid ${listening ? C.red : 'rgba(255,255,255,0.1)'}`, borderRadius: '12px', width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill={listening ? C.red : C.textMuted} xmlns="http://www.w3.org/2000/svg">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" fill="none" stroke={listening ? C.red : C.textMuted} strokeWidth="2" strokeLinecap="round"/>
        <line x1="12" y1="19" x2="12" y2="23" stroke={listening ? C.red : C.textMuted} strokeWidth="2" strokeLinecap="round"/>
        <line x1="8" y1="23" x2="16" y2="23" stroke={listening ? C.red : C.textMuted} strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </button>
  )
}

function GlobalStyles() {
  return (
    <style>{`
      @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
      @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-8px)} }
      @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      @keyframes fadeIn { from{opacity:0} to{opacity:1} }
      * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
      body { margin: 0; background: #04040A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      input, textarea, button { font-family: inherit; }
      ::-webkit-scrollbar { width: 3px; height: 3px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(255,107,0,0.25); border-radius: 4px; }
      textarea { font-family: inherit; }
    `}</style>
  )
}
