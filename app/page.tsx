'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Extrato } from '@/lib/types'
import Upload from '@/components/Upload'
import ResumoGeral from '@/components/ResumoGeral'
import TabelaAlertas from '@/components/TabelaAlertas'
import DetalhesPosto from '@/components/DetalhesPosto'
import AnaliseVeiculo from '@/components/AnaliseVeiculo'
import AnalisePrecoCombustivel from '@/components/AnalisePrecoCombustivel'
import AlertasAtipicos from '@/components/AlertasAtipicos'
import AnalisePosto from '@/components/AnalisePosto'
import PrecoAtual from '@/components/PrecoAtual'
import Confronto from '@/components/Confronto'
import GerenciarFrota from '@/components/GerenciarFrota'
import AbastecimentosTerceiros from '@/components/AbastecimentosTerceiros'
import ControleExtratos from '@/components/ControleExtratos'

type Aba = 'resumo' | 'postos' | 'alertas' | 'atipicos' | 'posto' | 'ranking' | 'preco' | 'precoatual' | 'eficiencia' | 'veiculo' | 'historico' | 'confronto' | 'frota' | 'terceiros' | 'controle'

interface DuplicataInfo {
  extratoExistente: {
    id: string
    nome: string
    periodo: string
    totalValor: number
    dataUpload: string
  }
  formData: FormData
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// ============================================================
// PALETA DARK PREMIUM AZUL (espelha globals.css)
// ============================================================
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
  accent2: '#6db3ff',
  accent3: '#2a7fd9',
  gold: '#d4b86a',
  red: '#f87171',
  amber: '#fbbf24',
  green: '#3ecf8e',
  violet: '#a78bfa',
}

export default function Dashboard() {
  const [extratos, setExtratos] = useState<Extrato[]>([])
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [abaAtiva, setAbaAtiva] = useState<Aba>('resumo')
  const [extratoSelecionado, setExtratoSelecionado] = useState<string>('todos')
  const [duplicataInfo, setDuplicataInfo] = useState<DuplicataInfo | null>(null)
  const [progresso, setProgresso] = useState<{ atual: number; total: number; nomeArquivo: string } | null>(null)

  const buscarExtratos = useCallback(async () => {
    const res = await fetch('/api/extratos')
    const data = await res.json()
    setExtratos(data)
    setCarregando(false)
  }, [])

  useEffect(() => { buscarExtratos() }, [buscarExtratos])

  const enviarForm = async (form: FormData, forcar = false): Promise<boolean> => {
    if (forcar) form.set('forcarSalvar', 'true')
    const res = await fetch('/api/processar', { method: 'POST', body: form })
    const data = await res.json()
    if (data.duplicata) {
      setDuplicataInfo({ extratoExistente: data.extratoExistente, formData: form })
      return false
    }
    if (data.sucesso) {
      await buscarExtratos()
      return true
    }
    alert('Erro ao processar: ' + (data.error || 'Tente novamente'))
    return false
  }

  const filaRef = useRef<File[]>([])
  const processandoFilaRef = useRef(false)

  const processarArquivo = async (arquivo: File): Promise<void> => {
    const isExcel = arquivo.name.endsWith('.xlsx') || arquivo.name.endsWith('.xls')
    try {
      if (isExcel) {
        const buf = await arquivo.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array', cellDates: true })
        const dadosAbas = wb.SheetNames.map(nome => ({
          nome,
          dados: XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: null })
        }))
        const form = new FormData()
        form.append('excel', JSON.stringify({ arquivo: arquivo.name, abas: dadosAbas }))
        await enviarForm(form)
      } else {
        const form = new FormData()
        form.append('pdf', arquivo)
        await enviarForm(form)
      }
    } catch {
      alert('Falha ao processar "' + arquivo.name + '". Continuando...')
    }
  }

  const processarFila = async () => {
    if (processandoFilaRef.current) return
    processandoFilaRef.current = true
    setProcessando(true)
    const total = filaRef.current.length
    let atual = 0
    while (filaRef.current.length > 0) {
      const arquivo = filaRef.current.shift()!
      atual++
      setProgresso({ atual, total, nomeArquivo: arquivo.name })
      await processarArquivo(arquivo)
    }
    setProcessando(false)
    setProgresso(null)
    processandoFilaRef.current = false
  }

  const handleUpload = (arquivo: File) => {
    filaRef.current.push(arquivo)
    if (!processandoFilaRef.current) processarFila()
  }

  const handleConfirmarDuplicata = async () => {
    if (!duplicataInfo) return
    setDuplicataInfo(null)
    setProcessando(true)
    try {
      await enviarForm(duplicataInfo.formData, true)
    } finally {
      setProcessando(false)
    }
  }

  const handleCancelarDuplicata = () => setDuplicataInfo(null)

  const handleDeletar = async (id: string) => {
    if (!confirm('Remover este extrato do histórico?')) return
    await fetch('/api/extratos', { method: 'DELETE', body: JSON.stringify({ id }), headers: { 'Content-Type': 'application/json' } })
    await buscarExtratos()
  }

  const [renomeando, setRenomeando] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [reprocessando, setReprocessando] = useState(false)

  const iniciarRenomear = () => {
    const e = extratos.find(x => x.id === extratoSelecionado)
    if (!e) return
    setNovoNome(e.postos[0]?.nome || e.periodo || e.arquivo)
    setRenomeando(true)
  }

  const handleRenomear = async () => {
    if (!novoNome.trim()) return
    await fetch('/api/extratos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: extratoSelecionado, nome: novoNome.trim() })
    })
    await buscarExtratos()
    setRenomeando(false)
  }

  const handleReprocessar = async () => {
    if (!confirm('Reprocessar este extrato com a frota atual? Os status das placas serão atualizados.')) return
    setReprocessando(true)
    try {
      await fetch('/api/reprocessar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: extratoSelecionado })
      })
      await buscarExtratos()
    } finally {
      setReprocessando(false)
    }
  }

  const extratosVisiveis = extratoSelecionado === 'todos'
    ? extratos
    : extratos.filter(e => e.id === extratoSelecionado)

  const totalGeral = extratosVisiveis.reduce((s, e) => s + e.totalValor, 0)
  const totalLitros = extratosVisiveis.reduce((s, e) => s + e.totalLitros, 0)
  const todosLancamentos = extratosVisiveis.flatMap(e => e.postos.flatMap(p => p.lancamentos))
  const todosPostos = extratosVisiveis.flatMap(e => e.postos)

  const totalTerceiros = todosLancamentos.filter(l => l.grupo === 'Abastecimentos de Terceiros/Vales').length

  const alertasAgregados = {
    confirmadaValor: extratosVisiveis.reduce((s, e) => s + e.alertas.confirmadaValor, 0),
    provalValor: extratosVisiveis.reduce((s, e) => s + e.alertas.provalValor, 0),
    naoIdentificadaValor: extratosVisiveis.reduce((s, e) => s + e.alertas.naoIdentificadaValor, 0),
    confirmada: extratosVisiveis.reduce((s, e) => s + e.alertas.confirmada, 0),
    provavel: extratosVisiveis.reduce((s, e) => s + e.alertas.provavel, 0),
    naoIdentificada: extratosVisiveis.reduce((s, e) => s + e.alertas.naoIdentificada, 0),
  }

  const hoje = new Date()
  const mesAtual = hoje.getMonth()
  const anoAtual = hoje.getFullYear()

  const faltandoMesesEncerrados = (() => {
    try {
      const salvo = typeof window !== 'undefined' ? localStorage.getItem('controle_postos') : null
      const POSTOS_PADRAO = [
        { id: '1', chave: 'SKINA ITALIANOS', frequencia: 'semanal' },
        { id: '2', chave: 'POSTO TIAGO', frequencia: 'semanal' },
        { id: '3', chave: 'PRAIA DE SAO FRANCISCO', frequencia: 'quinzenal' },
        { id: '4', chave: 'COOPERATIVA DOS CAFEICULTORES', frequencia: 'quinzenal' },
        { id: '5', chave: 'MOCAFOR', frequencia: 'quinzenal' },
        { id: '6', chave: 'IRMAOS MIGUEL', frequencia: 'quinzenal' },
        { id: '7', chave: 'ITAPIRENSE', frequencia: 'quinzenal' },
        { id: '8', chave: 'JL AGUAI', frequencia: 'quinzenal' },
        { id: '9', chave: 'ABASTECE RIO CLARO', frequencia: 'quinzenal' },
        { id: '10', chave: 'RVM MOGI', frequencia: 'quinzenal' },
        { id: '11', chave: 'SAO BENEDITO', frequencia: 'mensal' },
        { id: '12', chave: 'TANQUE AGUAS', frequencia: 'esporadico' },
      ]
      const postos = salvo ? JSON.parse(salvo) : POSTOS_PADRAO
      const esperadoMes: Record<string, number> = { semanal: 4, quinzenal: 2, mensal: 1, esporadico: 0 }

      const mesVerif = mesAtual === 0 ? 11 : mesAtual - 1
      const anoVerif = mesAtual === 0 ? anoAtual - 1 : anoAtual

      const extratosMesAnterior = extratos.filter(e => {
        const parts = e.periodo.split(' a ')[0].match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
        if (!parts) return false
        let ano = parseInt(parts[3]); if (ano < 100) ano += ano < 50 ? 2000 : 1900
        const mes = parseInt(parts[2]) - 1
        const primeiroDia = new Date(anoVerif, mesVerif, 1)
        const ultimoDia = new Date(anoVerif, mesVerif + 1, 0)
        const dataInicio = new Date(ano, mes, parseInt(parts[1]))
        return dataInicio <= ultimoDia && dataInicio >= primeiroDia
      })

      const salvoJust = typeof window !== 'undefined' ? localStorage.getItem('controle_justificativas') : null
      const justificativas = salvoJust ? JSON.parse(salvoJust) : {}

      return postos.filter((p: any) => {
        if (p.frequencia === 'esporadico') return false
        const chaveJust = `controle_just__${p.id}__${anoVerif}_${mesVerif}`
        if (justificativas[chaveJust]) return false
        const recebido = extratosMesAnterior.filter((e: Extrato) =>
          e.postos.some(ep => ep.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(
            p.chave.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          ))
        ).length
        return recebido < esperadoMes[p.frequencia]
      }).length
    } catch { return 0 }
  })()

  const abas: { id: Aba; label: string; badge?: number | string; vermelho?: boolean; ambar?: boolean; separadorAntes?: boolean }[] = [
    { id: 'resumo',     label: 'Resumo' },
    { id: 'posto',      label: 'Pesquisa por Posto' },
    { id: 'veiculo',    label: 'Pesquisa por Veículo' },
    { id: 'confronto',  label: 'Confronto', vermelho: true },
    { id: 'alertas',    label: 'Placas Divergentes', separadorAntes: true, badge: alertasAgregados.naoIdentificada > 0 ? alertasAgregados.naoIdentificada : undefined },
    { id: 'terceiros',  label: 'Terceiros/Vales', badge: totalTerceiros > 0 ? totalTerceiros : undefined, ambar: true },
    { id: 'postos',     label: 'Extratos Detalhados', separadorAntes: true, badge: todosPostos.length },
    { id: 'precoatual', label: 'Preço Vigente' },
    { id: 'atipicos',   label: 'Atípicos' },
    { id: 'preco',      label: 'Alerta de Preços' },
  ]

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <img src="/logo.png" alt="ETCO Tur" className="logo-img" />
            <div className="logo-divider" />
            <div className="logo-text">
              <div className="logo-title">Gestão de Frota</div>
              <div className="logo-sub">Controle de combustível</div>
            </div>
          </div>
          <div className="logo-nome-cursivo">Abastecimentos Etco Tur</div>
          <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <a href="/dp" style={{
              padding: '0.5rem 1rem', fontSize: 12, fontWeight: 600,
              background: 'rgba(74,158,255,0.10)',
              color: C.ink,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'inherit', whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(74,158,255,0.20)'
              e.currentTarget.style.borderColor = `${C.accent}60`
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(74,158,255,0.10)'
              e.currentTarget.style.borderColor = C.border
            }}
            >👥 Dep. Pessoal</a>

            <button onClick={() => setAbaAtiva('frota')} style={{
              padding: '0.5rem 1rem', fontSize: 12, fontWeight: 600,
              background: abaAtiva === 'frota'
                ? `linear-gradient(135deg, ${C.accent} 0%, ${C.accent3} 100%)`
                : 'rgba(74,158,255,0.10)',
              color: abaAtiva === 'frota' ? '#0a0f1f' : C.ink,
              border: `1px solid ${abaAtiva === 'frota' ? C.accent : C.border}`,
              borderRadius: 8,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s',
              boxShadow: abaAtiva === 'frota' ? `0 4px 12px ${C.accent}40` : 'none',
            }}>🚌 Frota</button>

            <Upload onUpload={handleUpload} processando={processando} progresso={progresso ?? undefined} />
          </div>
        </div>
      </header>

      <main className="main">
        <div className="filtro-bar">
          <label className="filtro-label">Período:</label>
          <select className="filtro-select" value={extratoSelecionado} onChange={e => setExtratoSelecionado(e.target.value)}>
            <option value="todos">Todos os extratos</option>
            {extratos.map(e => (
              <option key={e.id} value={e.id}>
                {e.postos[0]?.nome} — {e.periodo || e.arquivo} ({new Date(e.dataUpload).toLocaleDateString('pt-BR')})
              </option>
            ))}
          </select>
          {extratoSelecionado !== 'todos' && (
            <>
              {renomeando ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    value={novoNome}
                    onChange={e => setNovoNome(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRenomear(); if (e.key === 'Escape') setRenomeando(false) }}
                    autoFocus
                    style={{
                      padding: '0.4rem 0.8rem', fontSize: 13, borderRadius: 6,
                      border: `2px solid ${C.accent}`, fontFamily: 'inherit',
                      background: C.bgPanel2, color: C.ink, minWidth: 260,
                      outline: 'none',
                    }}
                  />
                  <button onClick={handleRenomear} style={{
                    padding: '0.4rem 0.95rem', fontSize: 12, fontWeight: 700,
                    background: `linear-gradient(135deg, ${C.accent} 0%, ${C.accent3} 100%)`,
                    color: '#0a0f1f', border: 'none',
                    borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: `0 2px 8px ${C.accent}40`,
                  }}>Salvar</button>
                  <button onClick={() => setRenomeando(false)} style={{
                    padding: '0.4rem 0.75rem', fontSize: 12, fontWeight: 600,
                    background: 'transparent', color: C.ink2,
                    border: `1px solid ${C.border}`, borderRadius: 6,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>Cancelar</button>
                </div>
              ) : (
                <button className="btn-renomear" onClick={iniciarRenomear}>✏️ Renomear</button>
              )}
              <button className="btn-deletar" onClick={() => handleDeletar(extratoSelecionado)}>
                Remover extrato
              </button>
              <button onClick={handleReprocessar} disabled={reprocessando} style={{
                padding: '0.5rem 0.875rem',
                border: `1px solid ${reprocessando ? C.border : 'rgba(62,207,142,0.40)'}`,
                borderRadius: 8,
                background: reprocessando ? C.bgPanel3 : 'rgba(62,207,142,0.10)',
                fontSize: 13, color: reprocessando ? C.muted : C.green,
                cursor: reprocessando ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', fontWeight: 500,
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                if (!reprocessando) {
                  e.currentTarget.style.background = 'rgba(62,207,142,0.20)'
                  e.currentTarget.style.borderColor = 'rgba(62,207,142,0.60)'
                }
              }}
              onMouseLeave={e => {
                if (!reprocessando) {
                  e.currentTarget.style.background = 'rgba(62,207,142,0.10)'
                  e.currentTarget.style.borderColor = 'rgba(62,207,142,0.40)'
                }
              }}>
                {reprocessando ? '⟳ Reprocessando...' : '⟳ Reprocessar frota'}
              </button>
            </>
          )}

          <div style={{ marginLeft: 'auto' }}>
            <button
              onClick={() => setAbaAtiva('controle')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0.5rem 1rem', fontSize: 12, fontWeight: 700,
                background: abaAtiva === 'controle'
                  ? `linear-gradient(135deg, ${C.accent} 0%, ${C.accent3} 100%)`
                  : C.bgPanel2,
                color: abaAtiva === 'controle' ? '#0a0f1f' : C.accent2,
                border: `1.5px solid ${abaAtiva === 'controle' ? C.accent : C.accent + '60'}`,
                borderRadius: 8,
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
                boxShadow: abaAtiva === 'controle' ? `0 4px 12px ${C.accent}40` : 'none',
              }}
            >
              📋 Controle de Lançamentos
              {faltandoMesesEncerrados > 0 && (
                <span style={{
                  background: C.red,
                  color: '#0a0f1f',
                  borderRadius: 10, fontSize: 10, fontWeight: 800,
                  padding: '1px 7px', lineHeight: 1.6,
                }}>{faltandoMesesEncerrados}</span>
              )}
            </button>
          </div>
        </div>

        {carregando ? (
          <div className="estado-vazio">Carregando dados...</div>
        ) : extratos.length === 0 ? (
          <div className="estado-vazio">
            <div className="estado-icone">↑</div>
            <div className="estado-titulo">Nenhum extrato carregado</div>
            <div className="estado-desc">Faça o upload do primeiro PDF para visualizar o dashboard</div>
          </div>
        ) : (
          <>
            <div className="abas">
              {abas.map(aba => (
                <span key={aba.id} style={{ display: 'contents' }}>
                  {aba.separadorAntes && (
                    <span style={{ width: 1, background: C.border, margin: '4px 4px', flexShrink: 0 }} />
                  )}
                  <button
                    className={`aba ${abaAtiva === aba.id ? 'aba-ativa' : ''}`}
                    onClick={() => setAbaAtiva(aba.id)}
                    style={
                      aba.ambar && abaAtiva !== aba.id
                        ? { color: C.amber }
                        : aba.ambar && abaAtiva === aba.id
                        ? {
                            color: '#0a0f1f',
                            background: `linear-gradient(135deg, ${C.amber} 0%, #f59e0b 100%)`,
                            border: `1px solid ${C.amber}`,
                            boxShadow: `0 2px 8px ${C.amber}40`,
                          }
                        : aba.vermelho && abaAtiva !== aba.id
                        ? { color: C.red }
                        : aba.vermelho && abaAtiva === aba.id
                        ? {
                            color: '#0a0f1f',
                            background: `linear-gradient(135deg, ${C.red} 0%, #dc2626 100%)`,
                            border: `1px solid ${C.red}`,
                            boxShadow: `0 2px 8px ${C.red}40`,
                          }
                        : {}
                    }
                  >
                    {aba.label}
                    {aba.badge !== undefined && aba.badge !== 0 && (
                      <span className="aba-badge">{aba.badge}</span>
                    )}
                  </button>
                </span>
              ))}
            </div>

            {abaAtiva === 'resumo'     && <ResumoGeral totalValor={totalGeral} totalLitros={totalLitros} totalVeiculos={new Set(todosLancamentos.map(l => l.placaLida)).size} alertas={alertasAgregados} lancamentos={todosLancamentos} extratos={extratos} />}
            {abaAtiva === 'posto'      && <AnalisePosto extratos={extratos} />}
            {abaAtiva === 'veiculo'    && <AnaliseVeiculo extratos={extratos} />}
            {abaAtiva === 'confronto'  && <Confronto extratos={extratos} />}
            {abaAtiva === 'alertas'    && <TabelaAlertas lancamentos={todosLancamentos} extratos={extratos} />}
            {abaAtiva === 'terceiros'  && <AbastecimentosTerceiros extratos={extratosVisiveis} />}
            {abaAtiva === 'postos'     && <div className="postos-grid">{todosPostos.map((posto, i) => <DetalhesPosto key={i} posto={posto} />)}</div>}
            {abaAtiva === 'precoatual' && <PrecoAtual extratos={extratos} />}
            {abaAtiva === 'atipicos'   && <AlertasAtipicos extratos={extratosVisiveis} />}
            {abaAtiva === 'preco'      && <AnalisePrecoCombustivel extratos={extratosVisiveis} />}
            {abaAtiva === 'controle'   && <ControleExtratos extratos={extratos} />}
            {abaAtiva === 'frota'      && <GerenciarFrota />}
          </>
        )}
      </main>

      {/* ── Modal de duplicata DARK ── */}
      {duplicataInfo && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '1rem',
        }}>
          <div style={{
            background: C.bgPanel,
            borderRadius: 16, padding: '2rem',
            maxWidth: 460, width: '100%',
            border: `1px solid ${C.borderStrong}`,
            boxShadow: `0 20px 80px rgba(0,0,0,0.6), 0 0 0 1px ${C.amber}30`,
            color: C.ink,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.25rem' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: `${C.amber}15`,
                border: `1px solid ${C.amber}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, flexShrink: 0,
              }}>⚠️</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: C.ink }}>Extrato possivelmente duplicado</div>
                <div style={{ fontSize: 13, color: C.ink2, marginTop: 3 }}>Este extrato parece já ter sido lançado</div>
              </div>
            </div>
            <div style={{
              background: C.bgPanel2,
              border: `1px solid ${C.border}`,
              borderRadius: 10, padding: '1rem 1.1rem', marginBottom: '1rem',
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: C.muted,
                textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8,
              }}>
                Extrato já salvo
              </div>
              <div style={{ fontWeight: 600, color: C.ink, fontSize: 14, marginBottom: 6 }}>
                {duplicataInfo.extratoExistente.nome}
              </div>
              <div style={{
                fontSize: 13, color: C.ink2,
                display: 'flex', flexWrap: 'wrap', gap: '4px 16px',
              }}>
                <span>📅 <span style={{ fontFamily: 'DM Mono, monospace' }}>{duplicataInfo.extratoExistente.periodo}</span></span>
                <span style={{ color: C.green, fontFamily: 'DM Mono, monospace' }}>💰 {fmt(duplicataInfo.extratoExistente.totalValor)}</span>
                <span style={{ color: C.muted }}>
                  Enviado em <span style={{ fontFamily: 'DM Mono, monospace' }}>{new Date(duplicataInfo.extratoExistente.dataUpload).toLocaleDateString('pt-BR')}</span>
                </span>
              </div>
            </div>
            <div style={{ fontSize: 13, color: C.ink2, marginBottom: '1.5rem', lineHeight: 1.5 }}>
              O sistema identificou um extrato do <strong style={{ color: C.ink }}>mesmo posto</strong>, com <strong style={{ color: C.ink }}>período idêntico</strong> e <strong style={{ color: C.ink }}>valor total similar</strong> já cadastrado. Deseja salvar mesmo assim?
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={handleCancelarDuplicata} style={{
                padding: '0.65rem 1.25rem', fontSize: 13, fontWeight: 600,
                background: C.bgPanel3, color: C.ink2,
                border: `1px solid ${C.border}`, borderRadius: 8,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancelar</button>
              <button onClick={handleConfirmarDuplicata} style={{
                padding: '0.65rem 1.4rem', fontSize: 13, fontWeight: 700,
                background: `linear-gradient(135deg, ${C.accent} 0%, ${C.accent3} 100%)`,
                color: '#0a0f1f',
                border: 'none', borderRadius: 8,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: `0 4px 12px ${C.accent}40`,
              }}>Salvar mesmo assim</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
