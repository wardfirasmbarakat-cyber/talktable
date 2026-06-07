// src/app/(auth)/change-password/page.tsx
'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function StrengthBar({ password }: { password: string }) {
  const checks = [
    { label: '8+ characters', pass: password.length >= 8 },
    { label: 'Uppercase letter', pass: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', pass: /[a-z]/.test(password) },
    { label: 'Number', pass: /\d/.test(password) },
  ]
  const score = checks.filter(c => c.pass).length
  const colors = ['#f87171','#fbbf24','#fbbf24','#4ade80','#4ade80']
  const labels = ['','Weak','Fair','Good','Strong']

  return (
    <div style={{ marginTop:'8px' }}>
      <div style={{ display:'flex', gap:'4px', marginBottom:'6px' }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ flex:1, height:'3px', borderRadius:'2px', background: i<=score ? colors[score] : 'rgba(255,255,255,0.08)', transition:'background 0.3s' }}/>
        ))}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
          {checks.map(c => (
            <span key={c.label} style={{ fontSize:'0.65rem', color: c.pass ? '#4ade80' : 'rgba(240,240,248,0.3)' }}>
              {c.pass ? '✓' : '○'} {c.label}
            </span>
          ))}
        </div>
        {password && <span style={{ fontSize:'0.65rem', color:colors[score], fontWeight:'600' }}>{labels[score]}</span>}
      </div>
    </div>
  )
}

function ChangePasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const required = searchParams.get('required') === 'true'

  const [current, setCurrent]     = useState('')
  const [newPw, setNewPw]         = useState('')
  const [confirm, setConfirm]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (newPw !== confirm) { setError('Passwords do not match'); return }
    if (newPw.length < 8) { setError('Password must be at least 8 characters'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: newPw, confirmPassword: confirm }),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to change password'); return }
      setSuccess(true)
      setTimeout(() => router.push('/dashboard'), 2000)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inp: React.CSSProperties = { width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'10px', padding:'11px 14px', color:'#F0F0F8', fontSize:'0.88rem', outline:'none', fontFamily:'inherit' }

  return (
    <div style={{ minHeight:'100vh', background:'#04040A', display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem', fontFamily:'Geist,system-ui,sans-serif' }}>
      <div style={{ width:'100%', maxWidth:'420px' }}>
        <div style={{ background:'#08080F', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'20px', padding:'2rem' }}>
          <div style={{ marginBottom:'1.5rem' }}>
            <div style={{ fontSize:'1.1rem', fontWeight:'700', letterSpacing:'-0.02em', color:'#F0F0F8', marginBottom:'6px' }}>
              {required ? '🔐 Create a Secure Password' : 'Change Password'}
            </div>
            {required && (
              <div style={{ background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:'10px', padding:'10px 14px', fontSize:'0.8rem', color:'#fbbf24' }}>
                ⚠️ Demo password detected. You must create a secure password before continuing.
              </div>
            )}
          </div>

          {success ? (
            <div style={{ textAlign:'center', padding:'1rem' }}>
              <div style={{ fontSize:'2.5rem', marginBottom:'0.75rem' }}>✅</div>
              <div style={{ fontWeight:'600', marginBottom:'4px' }}>Password Changed</div>
              <div style={{ fontSize:'0.82rem', color:'rgba(240,240,248,0.5)' }}>All other sessions have been logged out. Redirecting…</div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && (
                <div style={{ background:'rgba(232,32,42,0.1)', border:'1px solid rgba(232,32,42,0.25)', borderRadius:'10px', padding:'10px 14px', marginBottom:'1rem', fontSize:'0.82rem', color:'#f87171' }}>
                  {error}
                </div>
              )}
              <div style={{ marginBottom:'1rem' }}>
                <label style={{ fontSize:'0.73rem', color:'rgba(240,240,248,0.5)', display:'block', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'0.03em' }}>Current Password</label>
                <input type="password" required value={current} onChange={e=>setCurrent(e.target.value)} style={inp} autoComplete="current-password"/>
              </div>
              <div style={{ marginBottom:'1rem' }}>
                <label style={{ fontSize:'0.73rem', color:'rgba(240,240,248,0.5)', display:'block', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'0.03em' }}>New Password</label>
                <input type="password" required value={newPw} onChange={e=>setNewPw(e.target.value)} style={inp} autoComplete="new-password"/>
                <StrengthBar password={newPw}/>
              </div>
              <div style={{ marginBottom:'1.5rem' }}>
                <label style={{ fontSize:'0.73rem', color:'rgba(240,240,248,0.5)', display:'block', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'0.03em' }}>Confirm New Password</label>
                <input type="password" required value={confirm} onChange={e=>setConfirm(e.target.value)} style={{ ...inp, borderColor: confirm && confirm!==newPw ? 'rgba(232,32,42,0.4)' : undefined }} autoComplete="new-password"/>
                {confirm && confirm !== newPw && <div style={{ fontSize:'0.72rem', color:'#f87171', marginTop:'4px' }}>Passwords do not match</div>}
              </div>
              <button type="submit" disabled={loading} style={{ width:'100%', padding:'12px', background:'linear-gradient(135deg,#E8202A,#c41920)', border:'none', borderRadius:'10px', color:'#fff', fontWeight:'600', fontSize:'0.92rem', cursor:loading?'not-allowed':'pointer', opacity:loading?0.6:1, fontFamily:'inherit' }}>
                {loading ? 'Updating…' : 'Update Password'}
              </button>
              <div style={{ fontSize:'0.7rem', color:'rgba(240,240,248,0.3)', marginTop:'10px', textAlign:'center' }}>
                Changing your password will log out all other active sessions.
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={null}>
      <ChangePasswordForm />
    </Suspense>
  )
}
