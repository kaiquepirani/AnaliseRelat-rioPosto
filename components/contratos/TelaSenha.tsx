'use client'
import Image from 'next/image'
import { useEffect, useState } from 'react'

interface Props {
  onLogin: (token: string) => void
}

// Paleta inline (espelha src/lib/theme.ts) — TelaSenha funciona standalone
const C = {
  bg: '#0a0f1f',
  bgPanel: '#0f1830',
  bgPanel2: '#152340',
  bgPanel3: '#1c2d50',
  border: '#1e2d4f',
  borderStrong: '#2a3d68',
  ink: '#e8edf7',
  ink2: '#aab5cc',
  muted: '#6b7896',
  accent: '#4a9eff',
  accent3: '#2a7fd9',
  gold: '#d4b86a',
  red: '#f87171',
  amber: '#fbbf24',
}

export default function TelaSenha({ onLogin }: Props) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [capsLockOn, setCapsLockOn] = useState(false)

  // ──────────────────────────────────────────────────────────────────
  // Detecção de Caps Lock
  //
  // Estratégia em duas camadas para máxima confiabilidade:
  // 1) onKeyDown/onKeyUp do input — pega o estado em tempo real
  //    enquanto o usuário digita.
  // 2) Listener global no document — pega quando o usuário pressiona
  //    a tecla CapsLock antes mesmo de começar a digitar (ex.: ao
  //    abrir a tela com CapsLock já ativo no sistema, e o usuário
  //    aperta a tecla pra desativar).
  //
  // getModifierState('CapsLock') retorna o estado real do modificador,
  // não apenas se a tecla está pressionada no momento.
  // ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (typeof e.getModifierState === 'function') {
        setCapsLockOn(e.getModifierState('CapsLock'))
      }
    }
    document.addEventListener('keydown', handler)
    document.addEventListener('keyup', handler)
    return () => {
      document.removeEventListener('keydown', handler)
      document.removeEventListener('keyup', handler)
    }
  }, [])

  const verificarCapsLock = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'))
    }
  }

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
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: C.bg,
      backgroundImage: `
        radial-gradient(ellipse 1000px 700px at 20% -10%, rgba(74,158,255,0.10), transparent 60%),
        radial-gradient(ellipse 700px 500px at 85% 110%, rgba(212,184,106,0.07), transparent 60%),
        radial-gradient(ellipse 500px 400px at 50% 50%, rgba(42,127,217,0.05), transparent 60%)
      `,
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      padding: 20,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Grade de fundo sutil (igual à home) */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `
          linear-gradient(rgba(74,158,255,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(74,158,255,0.04) 1px, transparent 1px)
        `,
        backgroundSize: '48px 48px',
        pointerEvents: 'none',
      }} />

      <form onSubmit={submit} style={{
        background: C.bgPanel,
        padding: '44px 36px',
        borderRadius: 16,
        width: '100%',
        maxWidth: 420,
        border: `1px solid ${C.border}`,
        boxShadow: `
          0 24px 80px rgba(0,0,0,0.5),
          0 0 0 1px ${C.accent}20,
          inset 0 1px 0 rgba(255,255,255,0.04)
        `,
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Linha de luz no topo (premium touch) */}
        <div style={{
          position: 'absolute', top: 0, left: 24, right: 24, height: 1,
          background: `linear-gradient(90deg, transparent, ${C.accent}80 50%, transparent)`,
        }} />

        {/* Logo */}
        <div style={{
          textAlign: 'center',
          marginBottom: 28,
          padding: '16px 0',
          background: '#fff',
          borderRadius: 12,
          border: `1px solid ${C.border}`,
        }}>
          <Image src="/logo.png" alt="ETCO" width={120} height={60}
            style={{ objectFit: 'contain' }} />
        </div>

        <h1 style={{
          margin: 0,
          fontSize: 22,
          color: C.ink,
          textAlign: 'center',
          fontWeight: 700,
          letterSpacing: '-0.01em',
        }}>
          Painel de Contratos
        </h1>

        <p style={{
          marginTop: 10,
          fontSize: 13,
          color: C.ink2,
          textAlign: 'center',
          lineHeight: 1.5,
        }}>
          🔒 Área restrita — informe a senha para continuar
        </p>

        <label style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginTop: 28,
          fontSize: 11,
          color: C.ink2,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}>
          <span>Senha</span>
          {capsLockOn && (
            <span style={{
              fontSize: 10,
              color: C.amber,
              fontWeight: 700,
              letterSpacing: 0.4,
              background: `${C.amber}15`,
              border: `1px solid ${C.amber}40`,
              padding: '2px 8px',
              borderRadius: 4,
              textTransform: 'uppercase',
            }}>⚠️ Caps Lock</span>
          )}
        </label>

        <input
          type="password"
          value={senha}
          onChange={e => setSenha(e.target.value)}
          onKeyDown={verificarCapsLock}
          onKeyUp={verificarCapsLock}
          autoFocus
          style={{
            width: '100%',
            padding: '13px 14px',
            marginTop: 8,
            border: `1px solid ${capsLockOn ? `${C.amber}80` : C.border}`,
            borderRadius: 8,
            fontSize: 15,
            outline: 'none',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            background: C.bgPanel2,
            color: C.ink,
            transition: 'all 0.15s',
          }}
          onFocus={(e) => {
            if (!capsLockOn) e.currentTarget.style.borderColor = C.accent
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = capsLockOn ? `${C.amber}80` : C.border
          }}
        />

        {capsLockOn && (
          <div style={{
            marginTop: 10,
            padding: '8px 12px',
            background: `${C.amber}10`,
            color: C.amber,
            border: `1px solid ${C.amber}30`,
            borderLeft: `3px solid ${C.amber}`,
            borderRadius: 6,
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            lineHeight: 1.4,
          }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <span>
              <strong>Caps Lock está ativado.</strong> Sua senha pode ser digitada em maiúsculas.
            </span>
          </div>
        )}

        {erro && (
          <div style={{
            marginTop: 14,
            padding: '10px 14px',
            background: `${C.red}15`,
            color: C.red,
            border: `1px solid ${C.red}40`,
            borderRadius: 8,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span>⚠️</span> {erro}
          </div>
        )}

        <button type="submit" disabled={carregando || !senha} style={{
          width: '100%',
          marginTop: 22,
          padding: '13px',
          background: carregando || !senha
            ? C.bgPanel3
            : `linear-gradient(135deg, ${C.accent} 0%, ${C.accent3} 100%)`,
          color: carregando || !senha ? C.muted : '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 15,
          fontWeight: 600,
          cursor: carregando || !senha ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          boxShadow: carregando || !senha
            ? 'none'
            : `0 4px 16px ${C.accent}40`,
          transition: 'all 0.15s',
        }}>
          {carregando ? 'Verificando...' : 'Acessar →'}
        </button>

        <div style={{ marginTop: 22, textAlign: 'center' }}>
          <a href="/" style={{
            fontSize: 13,
            color: C.ink2,
            textDecoration: 'none',
            transition: 'color 0.15s',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.color = C.accent }}
            onMouseLeave={(e) => { e.currentTarget.style.color = C.ink2 }}
          >
            ← Voltar ao início
          </a>
        </div>
      </form>
    </div>
  )
}
