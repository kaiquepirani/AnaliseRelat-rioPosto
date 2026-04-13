'use client'
import { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { Extrato } from '@/lib/types'
import Upload from '@/components/Upload'
import ResumoGeral from '@/components/ResumoGeral'
import TabelaAlertas from '@/components/TabelaAlertas'
import HistoricoComparativo from '@/components/HistoricoComparativo'
import DetalhesPosto from '@/components/DetalhesPosto'
import AnaliseVeiculo from '@/components/AnaliseVeiculo'
import RankingConsumo from '@/components/RankingConsumo'
import AnalisePrecoCombustivel from '@/components/AnalisePrecoCombustivel'
import AlertasAtipicos from '@/components/AlertasAtipicos'
import AnalisePosto from '@/components/AnalisePosto'
import EficienciaKM from '@/components/EficienciaKM'
import PrecoAtual from '@/components/PrecoAtual'
import Confronto from '@/components/Confronto'

type Aba = 'resumo' | 'postos' | 'alertas' | 'atipicos' | 'posto' | 'ranking' | 'preco' | 'precoatual' | 'eficiencia' | 'veiculo' | 'historico' | 'confronto'

export default function Dashboard() {
  const [extratos, setExtratos] = useState<Extrato[]>([])
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [abaAtiva, setAbaAtiva] = useState<Aba>('resumo')
  const [extratoSelecionado, setExtratoSelecionado] = useState<string>('todos')

  const buscarExtratos = useCallback(async () => {
    const res = await fetch('/api/extratos')
    const data = await res.json()
    setExtratos(data)
    setCarregando(false)
  }, [])

  useEffect(() => { buscarExtratos() }, [buscarExtratos])

  const handleUpload = async (arquivo: File) => {
    setProcessando(true)
    const isExcel = arquivo.name.endsWith('.xlsx') || arquivo.name.endsWith('.xls')
    try {
      if (isExcel) {
        // Processar Excel no cliente e enviar como JSON
        const buf = await arquivo.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array', cellDates: true })
        const dadosAbas = wb.SheetNames.map(nome => ({
          nome,
          dados: XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: null })
        }))
        const form = new FormData()
        form.append('excel', JSON.stringify({ arquivo: arquivo.name, abas: dadosAbas }))
        const res = await fetch('/api/processar', { method: 'POST', body: form })
        const data = await res.json()
        if (data.sucesso) await buscarExtratos()
        else alert('Erro ao processar Excel: ' + (data.error || 'Tente novamente'))
      } else {
        // PDF — envia direto para Claude
        const form = new FormData()
        form.append('pdf', arquivo)
        const res = await fetch('/api/processar', { method: 'POST', body: form })
        const data = await res.json()
        if (data.sucesso) await buscarExtratos()
        else alert('Erro ao processar: ' + (data.error || 'Tente novamente'))
      }
    } catch {
      alert('Falha na comunicação com o servidor.')
    } finally {
      setProcessando(false)
    }
  }

  const handleDeletar = async (id: string) => {
    if (!confirm('Remover este extrato do histórico?')) return
    await fetch('/api/extratos', { method: 'DELETE', body: JSON.stringify({ id }), headers: { 'Content-Type': 'application/json' } })
    await buscarExtratos()
  }

  const [renomeando, setRenomeando] = useState(false)
  const [novoNome, setNovoNome] = useState('')

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

  const extratosVisiveis = extratoSelecionado === 'todos'
    ? extratos
    : extratos.filter(e => e.id === extratoSelecionado)

  const totalGeral = extratosVisiveis.reduce((s, e) => s + e.totalValor, 0)
  const totalLitros = extratosVisiveis.reduce((s, e) => s + e.totalLitros, 0)
  const todosLancamentos = extratosVisiveis.flatMap(e => e.postos.flatMap(p => p.lancamentos))
  const todosPostos = extratosVisiveis.flatMap(e => e.postos)

  const alertasAgregados = {
    confirmadaValor: extratosVisiveis.reduce((s, e) => s + e.alertas.confirmadaValor, 0),
    provalValor: extratosVisiveis.reduce((s, e) => s + e.alertas.provalValor, 0),
    naoIdentificadaValor: extratosVisiveis.reduce((s, e) => s + e.alertas.naoIdentificadaValor, 0),
    confirmada: extratosVisiveis.reduce((s, e) => s + e.alertas.confirmada, 0),
    provavel: extratosVisiveis.reduce((s, e) => s + e.alertas.provavel, 0),
    naoIdentificada: extratosVisiveis.reduce((s, e) => s + e.alertas.naoIdentificada, 0),
  }

  const totalAlertas = alertasAgregados.naoIdentificada + alertasAgregados.provavel

  const abas: { id: Aba; label: string; badge?: number | string }[] = [
    { id: 'resumo', label: 'Resumo' },
    { id: 'postos', label: 'Postos', badge: todosPostos.length },
    { id: 'alertas', label: 'Placas', badge: alertasAgregados.naoIdentificada > 0 ? alertasAgregados.naoIdentificada : undefined },
    { id: 'atipicos', label: 'Atípicos' },
    { id: 'posto', label: 'Por posto' },
    { id: 'ranking', label: 'Ranking' },
    { id: 'preco', label: 'Preço/litro' },
    { id: 'precoatual', label: 'Preço atual' },
    { id: 'eficiencia', label: 'Eficiência' },
    { id: 'veiculo', label: 'Por veículo' },
    { id: 'historico', label: 'Histórico' },
    { id: 'confronto', label: 'Confronto' },
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
          <div className="header-right">
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
                <button className="btn-renomear" onClick={iniciarRenomear}>
                  ✏️ Renomear
                </button>
              )}
              <button className="btn-deletar" onClick={() => handleDeletar(extratoSelecionado)}>
                Remover extrato
              </button>
            </>
          )}
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
                <button key={aba.id} className={`aba ${abaAtiva === aba.id ? 'aba-ativa' : ''}`} onClick={() => setAbaAtiva(aba.id)}>
                  {aba.label}
                  {aba.badge !== undefined && aba.badge !== 0 && (
                    <span className="aba-badge">{aba.badge}</span>
                  )}
                </button>
              ))}
            </div>

            {abaAtiva === 'resumo' && <ResumoGeral totalValor={totalGeral} totalLitros={totalLitros} totalVeiculos={new Set(todosLancamentos.map(l => l.placaLida)).size} alertas={alertasAgregados} lancamentos={todosLancamentos} />}
            {abaAtiva === 'postos' && <div className="postos-grid">{todosPostos.map((posto, i) => <DetalhesPosto key={i} posto={posto} />)}</div>}
            {abaAtiva === 'alertas' && <TabelaAlertas lancamentos={todosLancamentos} extratos={extratosVisiveis} />}
            {abaAtiva === 'atipicos' && <AlertasAtipicos extratos={extratosVisiveis} />}
            {abaAtiva === 'posto' && <AnalisePosto extratos={extratos} />}
            {abaAtiva === 'ranking' && <RankingConsumo extratos={extratosVisiveis} />}
            {abaAtiva === 'preco' && <AnalisePrecoCombustivel extratos={extratosVisiveis} />}
            {abaAtiva === 'precoatual' && <PrecoAtual extratos={extratos} />}
            {abaAtiva === 'eficiencia' && <EficienciaKM extratos={extratosVisiveis} />}
            {abaAtiva === 'veiculo' && <AnaliseVeiculo extratos={extratos} />}
            {abaAtiva === 'historico' && <HistoricoComparativo extratos={extratos} />}
            {abaAtiva === 'confronto' && <Confronto extratos={extratos} />}
          </>
        )}
      </main>
    </div>
  )
}
