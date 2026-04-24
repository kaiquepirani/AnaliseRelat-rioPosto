'use client'
import Image from 'next/image'
import { useState } from 'react'

interface Props {
  onLogin: (token: string) => void
}

export default function TelaSenha({ onLogin }: Props) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const r = await fetch('/api/contratos/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senha }),
      })
      const data = await r.json()
      if (r.ok && data.token) onLogin(data.token)
      else setErro(data.erro || 'Senha inválida')
    } catch {
      setErro('Falha ao conectar')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg,#2D3A6B 0%,#1a2548 100%)',
      fontFamily: "'Plus Jakarta Sans', sans-serif", padding: 20,
    }}>
      <form onSubmit={submit} style={{
        background: '#fff', padding: '40px 32px', borderRadius: 16,
        width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Image src="/logo.png" alt="ETCO" width={120} height={60} style={{ objectFit: 'contain' }} />
        </div>
        <h1 style={{ margin: 0, fontSize: 22, color: '#2D3A6B', textAlign: 'center' }}>
          Painel de Contratos
        </h1>
        <p style={{ marginTop: 8, fontSize: 14, color: '#64748b', textAlign: 'center' }}>
          Área restrita — informe a senha para continuar
        </p>
        <label style={{ display: 'block', marginTop: 24, fontSize: 13, color: '#374151', fontWeight: 600 }}>
          Senha
        </label>
        <input
          type="password" value={senha} onChange={e => setSenha(e.target.value)} autoFocus
          style={{
            width: '100%', padding: '12px 14px', marginTop: 6,
            border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 15,
            outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
        {erro && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#fef2f2', color: '#b91c1c', borderRadius: 6, fontSize: 13 }}>
            {erro}
          </div>
        )}
        <button type="submit" disabled={carregando || !senha} style={{
          width: '100%', marginTop: 20, padding: '12px',
          background: carregando || !senha ? '#94a3b8' : '#2D3A6B',
          color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600,
          cursor: carregando || !senha ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
        }}>
          {carregando ? 'Verificando...' : 'Acessar'}
        </button>
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <a href="/" style={{ fontSize: 13, color: '#64748b', textDecoration: 'none' }}>
            ← Voltar ao início
          </a>
        </div>
      </form>
    </div>
  )
}
