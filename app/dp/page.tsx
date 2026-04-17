'use client'
import { useState } from 'react'
import Link from 'next/link'
import CadastroColaboradores from '@/components/dp/CadastroColaboradores'
import ControlePagamentos from '@/components/dp/ControlePagamentos'

type Aba = 'pagamentos' | 'colaboradores'

export default function DepartamentoPessoal() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('pagamentos')

  const abas: { id: Aba; label: string; icon: string }[] = [
    { id: 'pagamentos',    label: 'Controle de Pagamentos', icon: '💰' },
    { id: 'colaboradores', label: 'Colaboradores',          icon: '👥' },
  ]

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <img src="/logo.png" alt="ETCO Tur" className="logo-img" />
            <div className="logo-divider" />
            <div className="logo-text">
              <div className="logo-title">Departamento Pessoal</div>
              <div className="logo-sub">Gestão de colaboradores</div>
            </div>
          </div>
          <div className="logo-nome-cursivo">ETCO Tur</div>
          <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/" style={{
              padding: '0.45rem 1rem', fontSize: 12, fontWeight: 700,
              background: 'rgba(255,255,255,0.15)', color: 'white',
              border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8,
              cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              ← Início
            </Link>
            <Link href="/dashboard" style={{
              padding: '0.45rem 1rem', fontSize: 12, fontWeight: 700,
              background: 'rgba(255,255,255,0.15)', color: 'white',
              border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8,
              cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              ⛽ Combustível
            </Link>
          </div>
        </div>
      </header>

      <main className="main">
        <div className="abas" style={{ marginBottom: '1.25rem' }}>
          {abas.map(aba => (
            <button
              key={aba.id}
              className={`aba ${abaAtiva === aba.id ? 'aba-ativa' : ''}`}
              onClick={() => setAbaAtiva(aba.id)}
            >
              {aba.icon} {aba.label}
            </button>
          ))}
        </div>

        {abaAtiva === 'pagamentos'    && <ControlePagamentos />}
        {abaAtiva === 'colaboradores' && <CadastroColaboradores />}
      </main>
    </div>
  )
}
