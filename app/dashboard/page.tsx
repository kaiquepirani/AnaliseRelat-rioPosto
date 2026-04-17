'use client'
import { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { Extrato } from '@/lib/types'
import Upload from '@/components/Upload'
import ResumoGeral from '@/components/ResumoGeral'
import TabelaAlertas from '@/components/TabelaAlertas'
// import HistoricoComparativo from '@/components/HistoricoComparativo'
import DetalhesPosto from '@/components/DetalhesPosto'
import AnaliseVeiculo from '@/components/AnaliseVeiculo'
// import RankingConsumo from '@/components/RankingConsumo'
import AnalisePrecoCombustivel from '@/components/AnalisePrecoCombustivel'
import AlertasAtipicos from '@/components/AlertasAtipicos'
import AnalisePosto from '@/components/AnalisePosto'
// import EficienciaKM from '@/components/EficienciaKM'
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

export default function Dashboard() {
  const [extratos, setExtratos] = useState<Extrato[]>([])
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [abaAtiva, setAbaAtiva] = useState<Aba>('resumo')
  const [extratoSelecionado, setExtratoSelecionado] = useState<string>('todos')
  const [duplicataInfo, setDuplicataInfo] = useState<DuplicataInfo | null>(null)

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

  const handleUpload = async (arquivo: File) => {
    setProcessando(true)
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
      alert('Falha na comunicação com o servidor.')
    } finally {
      setProcessando(false)
    }
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

  // Badge de controle: postos faltando no mês atual
  const hoje = new Date()
  const faltandoMesAtual = (() => {
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
      const extratosMes = extratos.filter(e => {
        const parts = e.periodo.split(' a ')[0].match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
        if (!parts) return false
        let ano = parseInt(parts[3]); if (ano < 100) ano += ano < 50 ? 2000 : 1900
        return parseInt(parts[2]) - 1 === hoje.getMonth() && ano === hoje.getFullYear()
      })
      return postos.filter((p: any) => {
        if (p.frequencia === 'esporadico') return false
        const recebido = extratosMes.filter((e: Extrato) =>
          e.postos.some(ep => ep.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(
            p.chave.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
          ))
        ).length
        return recebido < esperadoMes[p.frequencia]
      }).length
    } catch { return 0 }
  })()

  const abas: { id: Aba; label: string; badge?: number | string; vermelho?: boolean; separadorAntes?: boolean }[] = [
    { id: 'resumo',     label: 'Resumo' },
    { id: 'posto',      label: 'Pesquisa por Posto' },
    { id: 'veiculo',    label: 'Pesquisa por Veículo' },
    { id: 'confronto',  label: 'Confronto', vermelho: true },
    { id: 'alertas',    label: 'Placas Divergentes', separadorAntes: true, badge: alertasAgregados.naoIdentificada > 0 ? alertasAgregados.naoIdentificada : undefined },
    { id: 'terceiros',  label: 'Terceiros/Vales', badge: totalTerceiros > 0 ? totalTerceiros : undefined },
    { id: 'postos',     label: 'Extratos Detalhados', separadorAntes: true, badge: todosPostos.length },
    { id: 'precoatual', label: 'Preço Vigente' },
    { id: 'atipicos',   label: 'Atípicos' },
    { id: 'preco',      label: 'Alerta de Preços' },
    // { id: 'historico',  label: 'Histórico' },
    // { id: 'ranking',    label: 'Ranking' },
    // { id: 'eficiencia', label: 'Eficiência' },
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
            <button onClick={() => setAbaAtiva('frota')} style={{
              padding: '0.45rem 1rem', fontSize: 12, fontWeight: 700,
              background: abaAtiva === 'frota' ? 'white' : 'rgba(255,255,255,0.15)',
              color: abaAtiva === 'frota' ? 'var(--navy)' : 'white',
              border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8,
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            }}>🚌 Frota</button>
            <Upload onUpload={handleUpload} processando={processando} />
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
                      padding: '0.35rem 0.7rem', fontSize: 13, borderRadius: 6,
                      border: '2px solid var(--navy)', fontFamily: 'inherit',
                      background: 'white', color: 'var(--navy)', minWidth: 260,
                    }}
                  />
                  <button onClick={handleRenomear} style={{
                    padding: '0.35rem 0.9rem', fontSize: 12, fontWeight: 700,
                    background: 'var(--navy)', color: 'white', border: 'none',
                    borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
                  }}>Salvar</button>
                  <button onClick={() => setRenomeando(false)} style={{
                    padding: '0.35rem 0.7rem', fontSize: 12, fontWeight: 600,
                    background: 'transparent', color: 'var(--text-2)',
                    border: '1px solid var(--border)', borderRadius: 6,
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
                padding: '0.45rem 0.875rem', border: '1px solid #86efac',
                borderRadius: 'var(--radius-sm)', background: reprocessando ? 'var(--border)' : '#f0fdf4',
                fontSize: 13, color: '#16a34a', cursor: reprocessando ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', fontWeight: 500, transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}>
                {reprocessando ? '⟳ Reprocessando...' : '⟳ Reprocessar frota'}
              </button>
            </>
          )}

          {/* Controle de Lançamentos — canto direito da barra de período */}
          <div style={{ marginLeft: 'auto' }}>
            <button
              onClick={() => setAbaAtiva('controle')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0.45rem 1rem', fontSize: 12, fontWeight: 700,
                background: abaAtiva === 'controle' ? 'var(--navy)' : 'white',
                color: abaAtiva === 'controle' ? 'white' : 'var(--navy)',
                border: '1.5px solid var(--navy)', borderRadius: 8,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              📋 Controle de Lançamentos
              {faltandoMesAtual > 0 && (
                <span style={{
                  background: '#dc2626', color: 'white',
                  borderRadius: 10, fontSize: 10, fontWeight: 800,
                  padding: '1px 6px', lineHeight: 1.6,
                }}>{faltandoMesAtual}</span>
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
                    <span style={{ width: 1, background: 'var(--border)', margin: '4px 4px', flexShrink: 0 }} />
                  )}
                  <button
                    className={`aba ${abaAtiva === aba.id ? 'aba-ativa' : ''}`}
                    onClick={() => setAbaAtiva(aba.id)}
                    style={
                      aba.id === 'terceiros' && abaAtiva !== 'terceiros'
                        ? { color: '#92400e' }
                        : aba.id === 'terceiros' && abaAtiva === 'terceiros'
                        ? { color: 'white', background: '#92400e' }
                        : aba.vermelho && abaAtiva !== aba.id
                        ? { color: '#dc2626' }
                        : aba.vermelho && abaAtiva === aba.id
                        ? { color: 'white', background: '#dc2626' }
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
            {/* {abaAtiva === 'historico'  && <HistoricoComparativo extratos={extratos} />} */}
            {/* {abaAtiva === 'ranking'    && <RankingConsumo extratos={extratosVisiveis} />} */}
            {/* {abaAtiva === 'eficiencia' && <EficienciaKM extratos={extratosVisiveis} />} */}
          </>
        )}
      </main>

      {/* ── Modal de duplicata ── */}
      {duplicataInfo && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '1rem',
        }}>
          <div style={{
            background: 'white', borderRadius: 16, padding: '2rem',
            maxWidth: 460, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.25rem' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, background: '#fef9c3',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, flexShrink: 0,
              }}>⚠️</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>Extrato possivelmente duplicado</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Este extrato parece já ter sido lançado</div>
              </div>
            </div>
            <div style={{
              background: '#f8fafc', border: '1px solid #e2e8f0',
              borderRadius: 10, padding: '0.875rem 1rem', marginBottom: '1rem',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Extrato já salvo
              </div>
              <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 14, marginBottom: 4 }}>
                {duplicataInfo.extratoExistente.nome}
              </div>
              <div style={{ fontSize: 13, color: '#475569', display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                <span>📅 {duplicataInfo.extratoExistente.periodo}</span>
                <span>💰 {fmt(duplicataInfo.extratoExistente.totalValor)}</span>
                <span style={{ color: '#94a3b8' }}>
                  Enviado em {new Date(duplicataInfo.extratoExistente.dataUpload).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              O sistema identificou um extrato do <strong>mesmo posto</strong>, com <strong>período idêntico</strong> e <strong>valor total similar</strong> já cadastrado. Deseja salvar mesmo assim?
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={handleCancelarDuplicata} style={{
                padding: '0.6rem 1.25rem', fontSize: 13, fontWeight: 600,
                background: 'white', color: '#475569',
                border: '1px solid #e2e8f0', borderRadius: 8,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancelar</button>
              <button onClick={handleConfirmarDuplicata} style={{
                padding: '0.6rem 1.25rem', fontSize: 13, fontWeight: 700,
                background: '#2D3A6B', color: 'white',
                border: 'none', borderRadius: 8,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Salvar mesmo assim</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
