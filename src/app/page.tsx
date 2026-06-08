export default function CustomerPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#04040A',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      fontFamily: 'Geist, system-ui, sans-serif',
      color: '#F0F0F8',
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{
          width: '80px', height: '80px', borderRadius: '24px',
          background: 'linear-gradient(135deg, #E8202A, #ff4500)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '2.5rem', margin: '0 auto 1.5rem',
          boxShadow: '0 0 40px rgba(232,32,42,0.4)',
        }}>🍔</div>
        <h1 style={{ fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-0.04em', marginBottom: '0.5rem' }}>
          TalkTable
        </h1>
        <p style={{ fontSize: '1rem', color: 'rgba(240,240,248,0.5)', maxWidth: '320px', lineHeight: '1.6' }}>
          AI-powered ordering — scan your table&apos;s QR code to get started
        </p>
      </div>

      {/* Feature cards */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '3rem', maxWidth: '600px' }}>
        {([
          { icon: '💬', title: 'Talk to AI', desc: 'Ask questions, get recommendations' },
          { icon: '🛒', title: 'Order Easily', desc: 'Add items and place your order' },
          { icon: '📡', title: 'Live Updates', desc: 'Track your order in real time' },
        ] as const).map(f => (
          <div key={f.title} style={{
            background: '#08080F', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '16px', padding: '1.25rem', textAlign: 'center', width: '160px',
          }}>
            <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>{f.icon}</div>
            <div style={{ fontSize: '0.85rem', fontWeight: '600', marginBottom: '4px' }}>{f.title}</div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(240,240,248,0.4)' }}>{f.desc}</div>
          </div>
        ))}
      </div>

      {/* QR hint */}
      <div style={{
        background: 'rgba(79,158,255,0.06)', border: '1px solid rgba(79,158,255,0.15)',
        borderRadius: '14px', padding: '1rem 1.5rem', textAlign: 'center', marginBottom: '3rem',
      }}>
        <p style={{ fontSize: '0.85rem', color: 'rgba(240,240,248,0.6)', margin: 0 }}>
          📷 Scan the QR code on your table to begin ordering
        </p>
      </div>

      {/* Staff login link — plain <a> so it works without JS */}
      <a href="/login" style={{
        fontSize: '0.75rem',
        color: 'rgba(240,240,248,0.35)',
        textDecoration: 'none',
        padding: '8px 16px',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '8px',
        display: 'inline-block',
      }}>
        Staff login →
      </a>
    </div>
  )
}
