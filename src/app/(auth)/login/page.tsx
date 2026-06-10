// src/app/(auth)/login/page.tsx
'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setWarnings([])
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Login failed')
        return
      }

      if (data.warnings?.length) setWarnings(data.warnings)

      const { user } = data

      // Force password change for demo accounts or flagged users
      if (user.mustChangePassword) {
        router.push('/change-password?required=true')
        return
      }

      // Route by role
      const dashByRole: Record<string, string> = {
        ADMIN:   '/admin',
        OWNER:   '/manager',
        MANAGER: '/manager',
        KITCHEN: '/kitchen',
        WAITER:  '/waiter',
      }
      router.push(dashByRole[user.role] ?? redirect)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const demoAccounts = [
    { email: 'manager@firefly.demo',  role: 'Manager' },
    { email: 'kitchen@firefly.demo',  role: 'Kitchen' },
    { email: 'waiter@firefly.demo',   role: 'Waiter' },
    { email: 'admin@talktable.demo',  role: 'Admin' },
  ]

  return (
    <div style={{ minHeight:'100vh', background:'#04040A', display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem', fontFamily:'Geist,system-ui,sans-serif' }}>
      <div style={{ width:'100%', maxWidth:'400px' }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:'2rem' }}>
          <div style={{ width:'52px', height:'52px', borderRadius:'14px', background:'linear-gradient(135deg,#E8202A,#ff4500)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.5rem', margin:'0 auto 1rem', boxShadow:'0 0 24px rgba(232,32,42,0.4)' }}>🍔</div>
          <h1 style={{ fontSize:'1.5rem', fontWeight:'700', letterSpacing:'-0.03em', color:'#F0F0F8', marginBottom:'4px' }}>TalkTable</h1>
          <p style={{ fontSize:'0.8rem', color:'rgba(240,240,248,0.4)' }}>Staff Portal · Firefly Burger</p>
        </div>

        {/* Card */}
        <div style={{ background:'#08080F', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'20px', padding:'2rem' }}>
          <h2 style={{ fontSize:'1.1rem', fontWeight:'600', letterSpacing:'-0.02em', color:'#F0F0F8', marginBottom:'1.5rem' }}>Sign in to your account</h2>

          {error && (
            <div style={{ background:'rgba(232,32,42,0.1)', border:'1px solid rgba(232,32,42,0.25)', borderRadius:'10px', padding:'10px 14px', marginBottom:'1rem', fontSize:'0.82rem', color:'#f87171' }}>
              {error}
            </div>
          )}

          {warnings.map((w, i) => (
            <div key={i} style={{ background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:'10px', padding:'10px 14px', marginBottom:'1rem', fontSize:'0.82rem', color:'#fbbf24' }}>
              ⚠️ {w}
            </div>
          ))}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:'1rem' }}>
              <label style={{ fontSize:'0.73rem', color:'rgba(240,240,248,0.5)', display:'block', marginBottom:'6px', letterSpacing:'0.03em', textTransform:'uppercase' }}>Email</label>
              <input
                type="email" required autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
                style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'10px', padding:'11px 14px', color:'#F0F0F8', fontSize:'0.88rem', outline:'none', fontFamily:'inherit' }}
                onFocus={e => e.target.style.borderColor='rgba(79,158,255,0.4)'}
                onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.1)'}
              />
            </div>
            <div style={{ marginBottom:'1.5rem' }}>
              <label style={{ fontSize:'0.73rem', color:'rgba(240,240,248,0.5)', display:'block', marginBottom:'6px', letterSpacing:'0.03em', textTransform:'uppercase' }}>Password</label>
              <input
                type="password" required autoComplete="current-password"
                value={password} onChange={e => setPassword(e.target.value)}
                style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'10px', padding:'11px 14px', color:'#F0F0F8', fontSize:'0.88rem', outline:'none', fontFamily:'inherit' }}
                onFocus={e => e.target.style.borderColor='rgba(79,158,255,0.4)'}
                onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.1)'}
              />
            </div>
            <button
              type="submit" disabled={loading}
              style={{ width:'100%', padding:'12px', background:'linear-gradient(135deg,#E8202A,#c41920)', border:'none', borderRadius:'10px', color:'#fff', fontWeight:'600', fontSize:'0.92rem', cursor:loading?'not-allowed':'pointer', opacity:loading?0.6:1, fontFamily:'inherit', letterSpacing:'-0.01em', transition:'all 0.2s' }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Demo accounts */}
          <div style={{ marginTop:'1.5rem', paddingTop:'1.5rem', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize:'0.7rem', color:'rgba(240,240,248,0.3)', marginBottom:'8px', textTransform:'uppercase', letterSpacing:'0.04em' }}>Demo Accounts (password: 123321admin)</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
              {demoAccounts.map(a => (
                <button
                  key={a.email}
                  onClick={() => { setEmail(a.email); setPassword('123321admin') }}
                  style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 11px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'8px', color:'rgba(240,240,248,0.55)', fontSize:'0.73rem', cursor:'pointer', fontFamily:'inherit', transition:'all 0.2s' }}
                  onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor='rgba(79,158,255,0.2)'; (e.currentTarget as HTMLElement).style.color='rgba(240,240,248,0.8)' }}
                  onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor='rgba(255,255,255,0.06)'; (e.currentTarget as HTMLElement).style.color='rgba(240,240,248,0.55)' }}
                >
                  <span style={{ fontFamily:'monospace', fontSize:'0.7rem' }}>{a.email}</span>
                  <span style={{ background:'rgba(79,158,255,0.1)', color:'#7dd3fc', padding:'2px 8px', borderRadius:'100px', fontSize:'0.62rem', fontWeight:'600' }}>{a.role}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p style={{ textAlign:'center', fontSize:'0.72rem', color:'rgba(240,240,248,0.2)', marginTop:'1.5rem' }}>
          🔒 Secured with Argon2 hashing · JWT sessions · Rate limiting
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight:'100vh', background:'#04040A' }} />}>
      <LoginForm />
    </Suspense>
  )
}
