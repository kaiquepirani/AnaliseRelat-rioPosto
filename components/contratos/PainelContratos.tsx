'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import type { Contrato, ContratoComAlerta, ItemContrato } from '@/lib/contratos-types'
import {
  calcularSituacao, itensVigentes, valorTotalAtual,
  rotuloAditamentoAtual, rotuloTipoAditamento, corTipoAditamento,
} from '@/lib/contratos-types'
import FormularioContrato from './FormularioContrato'
import PreviaImportacao from './PreviaImportacao'
import ResumoContratos from './ResumoContratos'
import FaturamentoPainel from './FaturamentoPainel'
import FinanciamentosPainel from './FinanciamentosPainel'

interface Props {
  token: string
  onLogout: () => void
}

// Paleta dark premium (espelha src/lib/theme.ts)
const C = {
  bg: '#0a0f1f',
  bgPanel: '#0f1830',
  bgPanel2: '#152340',
  bgPanel3: '#1c2d50',
  bgHeader: '#0d1428',
  border: '#1e2d4f',
  borderStrong: '#2a3d68',
  ink: '#e8edf7',
  ink2: '#aab5cc',
  muted: '#6b7896',
  accent: '#4a9eff',
  accent2: '#6db3ff',
  accent3: '#2a7fd9',
  gold: '#d4b86a',
}

const fmtReal = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtReal4 = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })
const fmtNum = (n: number) => n.toLocaleString('pt-BR')

const fmtData = (iso: string | undefined) => {
  if (!iso) return '—'
  const p = iso.split('-')
  if (p.length !== 3) return iso
  return `${p[2]}/${p[1]}/${p[0]}`
}

const corSituacao = (s: ContratoComAlerta['situacao']) => {
  if (s === 'vencido')       return { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' }
  if (s === 'vencendo')      return { bg: '#fffbeb', border: '#fde68a', text: '#b45309' }
  if (s === 'vencendo_60')   return { bg: '#fefce8', border: '#fde047', text: '#854d0e' }
  if (s === 'em_renovacao')  return { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' }
  if (s === 'encerrado')     return { bg: '#f3f4f6', border: '#e5e7eb', text: '#4b5563' }
  return { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' }
}

const rotuloSituacao = (s: ContratoComAlerta['situacao']) => {
  if (s === 'vencido')       return 'VENCIDO'
  if (s === 'vencendo')      return 'VENCENDO'
  if (s === 'vencendo_60')   return 'A VENCER'
  if (s === 'em_renovacao')  return 'EM RENOVAÇÃO'
  if (s === 'encerrado')     return 'ENCERRADO'
  return 'VIGENTE'
}

type Aba = 'resumo' | 'contratos' | 'faturamento' | 'financiamentos'
type FiltroSituacao = 'ativos' | 'todos' | 'vigentes_todos' | 'vigente' | 'vencendo' | 'vencendo_60' | 'vencido' | 'encerrado' | 'em_renovacao'

export default function PainelContratos({ token, onLogout }: Props) {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('resumo')
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroSituacao, setFiltroSituacao] = useState<FiltroSituacao>('ativos')
  const [filtroCidade, setFiltroCidade] = useState<string>('')
  const [busca, setBusca] = useState('')
  const [formAberto, setFormAberto] = useState(false)
  const [emEdicao, setEmEdicao] = useState<Contrato | null>(null)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [importando, setImportando] = useState(false)
  const [statusImport, setStatusImport] = useState<string>('')
  const [previaDados, setPreviaDados] = useState<any>(null)
  const inputImportRef = useRef<HTMLInputElement>(null)

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await fetch('/api/contratos', { headers })
      if (r.status === 401) { onLogout(); return }
      const data = await r.json()
      setContratos(Array.isArray(data) ? data : [])
    } finally {
      setCarregando(false)
    }
  }, [headers, onLogout])

  useEffect(() => { carregar() }, [carregar])

  const contratosComAlerta: ContratoComAlerta[] = useMemo(
    () => contratos.map(calcularSituacao),
    [contratos],
  )

  const cidades = useMemo(() => {
    const set = new Set<string>()
    for (const c of contratos) if (c.cidade) set.add(c.cidade)
    return Array.from(set).sort()
  }, [contratos])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const lista = contratosComAlerta.filter(c => {
      if (filtroSituacao === 'ativos') {
        if (c.situacao === 'encerrado') return false
      } else if (filtroSituacao === 'vigentes_todos') {
        if (c.situacao !== 'vigente' && c.situacao !== 'vencendo' && c.situacao !== 'vencendo_60') return false
      } else if (filtroSituacao !== 'todos') {
        if (c.situacao !== filtroSituacao) return false
      }
      if (filtroCidade && c.cidade !== filtroCidade) return false
      if (termo) {
        const alvo = `${c.cliente} ${c.contratante || ''} ${c.numero} ${c.tipoServico} ${c.cidade}`.toLowerCase()
        if (alvo.indexOf(termo) === -1) return false
      }
      return true
    })
    return lista.sort((a, b) => {
      const cidadeA = (a.cidade || '').toLowerCase()
      const cidadeB = (b.cidade || '').toLowerCase()
      if (cidadeA !== cidadeB) return cidadeA.localeCompare(cidadeB, 'pt-BR')
      return (a.contratante || a.cliente || '').localeCompare(b.contratante || b.cliente || '', 'pt-BR')
    })
  }, [contratosComAlerta, filtroSituacao, filtroCidade, busca])

  const kpis = useMemo(() => {
    const vigentes = contratosComAlerta.filter(c =>
      c.situacao === 'vigente' || c.situacao === 'vencendo' || c.situacao === 'vencendo_60',
    )
    const vencendo = contratosComAlerta.filter(c => c.situacao === 'vencendo')
    const vencendo60 = contratosComAlerta.filter(c => c.situacao === 'vencendo_60')
    const vencidos = contratosComAlerta.filter(c => c.situacao === 'vencido')
    const valorTotal = vigentes.reduce((acc, c) => acc + valorTotalAtual(c), 0)
    return {
      vigentes: vigentes.length,
      vencendo: vencendo.length,
      vencendo60: vencendo60.length,
      vencidos: vencidos.length,
      valorTotal,
    }
  }, [contratosComAlerta])

  const aplicarFiltroCard = (alvo: FiltroSituacao) => {
    setFiltroSituacao(prev => prev === alvo ? 'ativos' : alvo)
  }

  const abrirNovo = () => { setEmEdicao(null); setFormAberto(true) }
  const abrirEdicao = (c: Contrato) => { setEmEdicao(c); setFormAberto(true) }
  const fecharForm = () => { setFormAberto(false); setEmEdicao(null) }

  const toggleExpandido = (id: string) => {
    const novo = new Set(expandidos)
    if (novo.has(id)) novo.delete(id); else novo.add(id)
    setExpandidos(novo)
  }

  const salvar = async (dados: Partial<Contrato>) => {
    const url = emEdicao ? `/api/contratos/${emEdicao.id}` : '/api/contratos'
    const method = emEdicao ? 'PUT' : 'POST'
    const r = await fetch(url, {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    })
    if (!r.ok) {
      const data = await r.json().catch(() => ({}))
      alert(data.erro || 'Erro ao salvar')
      return
    }
    fecharForm()
    await carregar()
  }

  const excluir = async (c: Contrato) => {
    if (!confirm(`Excluir o contrato de "${c.cliente}"? Esta ação também removerá todos os aditamentos e PDFs associados. Não pode ser desfeita.`)) return
    const r = await fetch(`/api/contratos/${c.id}`, { method: 'DELETE', headers })
    if (!r.ok) { alert('Erro ao excluir'); return }
    await carregar()
  }

  const importarPDF = async (file: File) => {
    setImportando(true)
    setStatusImport('Preparando...')
    try {
      const tamanhoMB = (file.size / 1024 / 1024).toFixed(2)
      if (file.size > 50 * 1024 * 1024) {
        alert(`Arquivo muito grande (${tamanhoMB} MB). O limite é 50 MB.`)
        return
      }

      let arquivoFinal = file
      const LIMITE_VERCEL = 3.8 * 1024 * 1024

      if (file.size > LIMITE_VERCEL) {
        try {
          setStatusImport('Comprimindo PDF...')
          const { comprimirAteCaber, formatarTamanho } = await import('@/lib/comprimir-pdf')
          const resultado = await comprimirAteCaber(file, (msg) => setStatusImport(msg))

          if (!resultado.cabeNoLimite) {
            alert(
              `Não foi possível comprimir o PDF o suficiente.\n\n` +
              `Original: ${formatarTamanho(resultado.tamanhoOriginal)}\n` +
              `Após compressão: ${formatarTamanho(resultado.tamanhoFinal)}\n` +
              `Limite: 4 MB\n\n` +
              `Sugestões:\n` +
              `• Use ilovepdf.com/pt/comprimir_pdf com "Compressão extrema"\n` +
              `• Cadastre manualmente pelo botão "+ Novo manual"`,
            )
            return
          }

          arquivoFinal = resultado.arquivoComprimido
          console.log(`PDF comprimido: ${formatarTamanho(resultado.tamanhoOriginal)} → ${formatarTamanho(resultado.tamanhoFinal)} (-${(resultado.reducao * 100).toFixed(0)}%)`)
        } catch (errComp: any) {
          alert(
            `Falha ao comprimir o PDF.\n\n` +
            `Detalhe: ${errComp?.message || 'erro desconhecido'}\n\n` +
            `Tente comprimir manualmente em ilovepdf.com antes de importar.`,
          )
          return
        }
      }

      setStatusImport('Enviando...')
      const fdUp = new FormData()
      fdUp.append('file', arquivoFinal)
      const rUp = await fetch('/api/contratos/upload', {
        method: 'POST', headers, body: fdUp,
      })
      if (!rUp.ok) {
        const dUp = await rUp.json().catch(() => ({}))
        alert(dUp.erro || `Falha ao enviar o PDF (status ${rUp.status})`)
        return
      }
      const upData = await rUp.json()

      setStatusImport('Analisando com IA...')
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 70000)

      let r: Response
      try {
        r = await fetch('/api/contratos/importar-completo', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ blobUrl: upData.url }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }

      if (!r.ok) {
        let mensagem = 'Erro ao analisar PDF'
        try {
          const data = await r.json()
          mensagem = data.erro || mensagem
          if (data.detalhe) mensagem += `\n\nDetalhe: ${data.detalhe}`
        } catch {
          mensagem = `Erro ${r.status} ao analisar PDF`
        }
        alert(mensagem)
        return
      }

      const data = await r.json()
      setPreviaDados({
        ...data,
        file: arquivoFinal,
        uploadedBlob: upData,
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        alert('A análise demorou mais de 70 segundos e foi cancelada.\n\nTente:\n• Cadastrar manualmente pelo botão "+ Novo manual"')
      } else {
        alert(`Erro inesperado.\n\nDetalhe: ${err?.message || 'desconhecido'}`)
      }
    } finally {
      setImportando(false)
      setStatusImport('')
      if (inputImportRef.current) inputImportRef.current.value = ''
    }
  }

  const confirmarImportacao = async (dadosFinais: any) => {
    const upData = previaDados?.uploadedBlob
    if (!upData) {
      alert('Dados do upload perdidos. Recomece a importação.')
      return
    }

    const body = {
      ...dadosFinais.contrato,
      arquivoUrl: upData.url,
      arquivoNome: upData.nome,
      arquivoSize: upData.tamanho,
      aditamentos: (dadosFinais.aditamentos || []).map((a: any) => ({
        ...a,
        arquivoUrl: upData.url,
        arquivoNome: upData.nome,
        arquivoSize: upData.tamanho,
      })),
    }

    const r = await fetch('/api/contratos', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      alert(d.erro || 'Erro ao salvar contrato')
      return
    }
    setPreviaDados(null)
    await carregar()
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f4f6fb',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      {/* ============ HEADER DARK PREMIUM ============ */}
      <header style={{
        background: C.bgHeader,
        backgroundImage: `
          radial-gradient(ellipse 600px 300px at 10% 50%, rgba(74,158,255,0.10), transparent 60%),
          radial-gradient(ellipse 400px 200px at 90% 50%, rgba(212,184,106,0.06), transparent 60%)
        `,
        padding: '18px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 14,
        borderBottom: `1px solid ${C.border}`,
        position: 'relative',
      }}>
        {/* Linha de luz dourada sutil no rodapé do header */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg, transparent, ${C.gold}40 50%, transparent)`,
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
          <Image src="/logo.png" alt="ETCO" width={48} height={48}
            style={{
              objectFit: 'contain',
              background: '#fff',
              borderRadius: 8,
              padding: 4,
              border: `1px solid ${C.border}`,
            }} />
          <div>
            <div style={{
              color: C.ink,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '-0.01em',
            }}>Painel de Contratos</div>
            <div style={{
              color: C.accent2,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: 0.04,
              marginTop: 2,
              textTransform: 'uppercase',
            }}>Gestão de contratos vigentes</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
          <Link href="/" style={headerBtn}>← Início</Link>
          <button onClick={onLogout} style={{
            ...headerBtn,
            border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}>Sair</button>
        </div>
      </header>

      {/* ============ BARRA DE ABAS DARK ============ */}
      <div style={{
        background: C.bgPanel,
        borderBottom: `1px solid ${C.border}`,
        padding: '0 28px',
        display: 'flex',
        gap: 4,
        position: 'sticky',
        top: 0,
        zIndex: 10,
        overflowX: 'auto',
      }}>
        <BotaoAba ativo={abaAtiva === 'resumo'} onClick={() => setAbaAtiva('resumo')}
          icone="📊" label="Resumo" />
        <BotaoAba ativo={abaAtiva === 'contratos'} onClick={() => setAbaAtiva('contratos')}
          icone="📋" label="Contratos" />
        <BotaoAba ativo={abaAtiva === 'faturamento'} onClick={() => setAbaAtiva('faturamento')}
          icone="💵" label="Faturamento" />
        <BotaoAba ativo={abaAtiva === 'financiamentos'} onClick={() => setAbaAtiva('financiamentos')}
          icone="💰" label="Financiamentos" />
      </div>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>

        {abaAtiva === 'faturamento' ? (
          <FaturamentoPainel token={token} onLogout={onLogout} />
        ) : abaAtiva === 'financiamentos' ? (
          <FinanciamentosPainel token={token} onLogout={onLogout} />
        ) : carregando ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 12 }}>
            Carregando...
          </div>
        ) : abaAtiva === 'resumo' ? (
          <ResumoContratos contratos={contratos} />
        ) : (
          <>
            {kpis.vencendo > 0 && (
              <AlertaTopo cor="#f59e0b" bg="#fffbeb" borda="#fde68a" textoCor="#92400e"
                emoji="⚠️"
                titulo={`${kpis.vencendo === 1 ? '1 contrato vence' : `${kpis.vencendo} contratos vencem`} nos próximos 30 dias`}
                sub="Revise e providencie a renovação antes do vencimento." />
            )}
            {kpis.vencendo60 > 0 && (
              <AlertaTopo cor="#eab308" bg="#fefce8" borda="#fde047" textoCor="#854d0e"
                emoji="📅"
                titulo={`${kpis.vencendo60 === 1 ? '1 contrato vence' : `${kpis.vencendo60} contratos vencem`} entre 31 e 60 dias`}
                sub="Comece a planejar a renovação ou nova licitação com antecedência." />
            )}
            {kpis.vencidos > 0 && (
              <AlertaTopo cor="#dc2626" bg="#fef2f2" borda="#fecaca" textoCor="#991b1b"
                emoji="🚨"
                titulo={`${kpis.vencidos === 1 ? '1 contrato está vencido' : `${kpis.vencidos} contratos estão vencidos`}`}
                sub="Atualize o status (renovado ou encerrado) para manter o painel correto." />
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 14, marginBottom: 20,
            }}>
              <KPI titulo="Contratos vigentes" valor={String(kpis.vigentes)} cor="#2D3A6B"
                onClick={() => aplicarFiltroCard('vigentes_todos')}
                ativo={filtroSituacao === 'vigentes_todos'} />
              <KPI titulo="Vencendo em 30 dias" valor={String(kpis.vencendo)} cor="#f59e0b"
                onClick={() => aplicarFiltroCard('vencendo')}
                ativo={filtroSituacao === 'vencendo'} />
              <KPI titulo="Vencendo em 60 dias" valor={String(kpis.vencendo60)} cor="#eab308"
                onClick={() => aplicarFiltroCard('vencendo_60')}
                ativo={filtroSituacao === 'vencendo_60'} />
              <KPI titulo="Vencidos" valor={String(kpis.vencidos)} cor="#dc2626"
                onClick={() => aplicarFiltroCard('vencido')}
                ativo={filtroSituacao === 'vencido'} />
              <KPI titulo="Valor total vigente" valor={fmtReal(kpis.valorTotal)} cor="#4AABDB" />
            </div>

            <div style={{
              background: '#fff', padding: 14, borderRadius: 12,
              display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
              marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <input
                placeholder="Buscar por contratante, número, cidade..."
                value={busca} onChange={e => setBusca(e.target.value)}
                style={{
                  flex: '1 1 220px', padding: '10px 12px', border: '1px solid #e5e7eb',
                  borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none',
                }}
              />
              <select value={filtroSituacao} onChange={e => setFiltroSituacao(e.target.value as FiltroSituacao)} style={selectStyle}>
                <option value="ativos">Ativos (padrão)</option>
                <option value="todos">Todos</option>
                <option value="vigentes_todos">Vigentes (todos)</option>
                <option value="vigente">Vigentes (sem alerta)</option>
                <option value="vencendo">Vencendo (30d)</option>
                <option value="vencendo_60">A vencer (31-60d)</option>
                <option value="vencido">Vencidos</option>
                <option value="em_renovacao">Em renovação</option>
                <option value="encerrado">Encerrados</option>
              </select>
              <select value={filtroCidade} onChange={e => setFiltroCidade(e.target.value)} style={selectStyle}>
                <option value="">Todas as cidades</option>
                {cidades.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              <input ref={inputImportRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) importarPDF(f) }} />
              <button onClick={() => inputImportRef.current?.click()} disabled={importando} style={{
                padding: '10px 16px',
                background: importando ? '#94a3b8' : '#7c3aed', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: importando ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                minWidth: 180,
              }}>
                {importando ? `✨ ${statusImport || 'Processando...'}` : '✨ Importar PDF (IA)'}
              </button>
              <button onClick={abrirNovo} style={{
                padding: '10px 16px', background: '#2D3A6B', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>+ Novo manual</button>
            </div>

            {filtrados.length === 0 ? (
              <div style={{
                padding: 40, textAlign: 'center', color: '#64748b',
                background: '#fff', borderRadius: 12,
              }}>
                {contratos.length === 0
                  ? 'Nenhum contrato cadastrado. Clique em "✨ Importar PDF (IA)" para começar.'
                  : 'Nenhum contrato encontrado com esses filtros.'}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {filtrados.map(c => (
                  <CardContrato
                    key={c.id} contrato={c} token={token}
                    expandido={expandidos.has(c.id)}
                    onToggle={() => toggleExpandido(c.id)}
                    onEditar={() => abrirEdicao(c)}
                    onExcluir={() => excluir(c)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {formAberto && (
        <FormularioContrato
          contrato={emEdicao} token={token}
          onCancelar={fecharForm} onSalvar={salvar}
          onAtualizarLista={carregar}
        />
      )}

      {previaDados && (
        <PreviaImportacao
          dados={previaDados}
          onCancelar={() => setPreviaDados(null)}
          onConfirmar={confirmarImportacao}
        />
      )}
    </div>
  )
}

// ============ BotaoAba DARK ============
const BotaoAba = ({ ativo, onClick, icone, label }: {
  ativo: boolean; onClick: () => void; icone: string; label: string
}) => (
  <button onClick={onClick} style={{
    padding: '14px 22px',
    background: ativo ? C.bgPanel2 : 'transparent',
    color: ativo ? C.ink : C.ink2,
    border: 'none',
    borderBottom: `2px solid ${ativo ? C.accent : 'transparent'}`,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
    position: 'relative',
  }}
    onMouseEnter={(e) => { if (!ativo) e.currentTarget.style.color = C.ink }}
    onMouseLeave={(e) => { if (!ativo) e.currentTarget.style.color = C.ink2 }}
  >
    <span style={{ fontSize: 16 }}>{icone}</span>
    {label}
  </button>
)

const CardContrato = ({ contrato, token, expandido, onToggle, onEditar, onExcluir }: {
  contrato: ContratoComAlerta
  token: string
  expandido: boolean
  onToggle: () => void
  onEditar: () => void
  onExcluir: () => void
}) => {
  const cor = corSituacao(contrato.situacao)
  const qtdAditamentos = Array.isArray(contrato.aditamentos) ? contrato.aditamentos.length : 0
  const ultimoAd = qtdAditamentos > 0 && contrato.aditamentos
    ? contrato.aditamentos[contrato.aditamentos.length - 1]
    : null
  const itens = itensVigentes(contrato)
  const totalAtual = valorTotalAtual(contrato)
  const objetoCurto = (contrato.objeto || '').length > 90
    ? (contrato.objeto || '').slice(0, 90) + '…'
    : (contrato.objeto || '')

  return (
    <div style={{
      background: '#fff', borderRadius: 8,
      borderLeft: `4px solid ${cor.text}`,
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      opacity: contrato.situacao === 'encerrado' ? 0.65 : 1,
      overflow: 'hidden',
    }}>
      <div onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px', cursor: 'pointer',
        flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
          background: cor.bg, color: cor.text, border: `1px solid ${cor.border}`,
          padding: '2px 6px', borderRadius: 3, flexShrink: 0,
        }}>{rotuloSituacao(contrato.situacao)}</span>

        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
              {contrato.cidade || '—'}
            </span>
            <span style={{ fontSize: 12, color: '#475569' }}>
              {contrato.contratante || contrato.cliente}
            </span>
            {contrato.numero && (
              <span style={{ fontSize: 11, color: '#94a3b8' }}>· Nº {contrato.numero}</span>
            )}
          </div>
          {objetoCurto && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>
              {objetoCurto}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: cor.text }}>
            {fmtData(contrato.situacao === 'encerrado' && contrato.dataEncerramento ? contrato.dataEncerramento : contrato.dataVencimento)}
          </div>
          <div style={{ fontSize: 10, color: '#64748b' }}>
            {contrato.situacao === 'vencido'
              ? `Venceu há ${Math.abs(contrato.diasRestantes)}d`
              : contrato.situacao === 'encerrado'
              ? 'Encerrado'
              : contrato.situacao === 'em_renovacao'
              ? 'Em renovação'
              : `Faltam ${contrato.diasRestantes}d`}
          </div>
        </div>

        <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
          {expandido ? '▲' : '▼'}
        </span>
      </div>

      {expandido && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid #f1f5f9', background: '#fafbfd' }}>

          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span>{contrato.tipoServico}</span>
            {contrato.cnpjContratante && <span>· CNPJ {contrato.cnpjContratante}</span>}
            <span style={{
              fontSize: 10, fontWeight: 600, color: '#7c3aed',
              background: '#f5f3ff', border: '1px solid #ddd6fe',
              padding: '1px 6px', borderRadius: 3,
            }}>{rotuloAditamentoAtual(contrato)}</span>
            {ultimoAd && (
              <span style={{ color: corTipoAditamento(ultimoAd.tipo), fontWeight: 600 }}>
                · {ultimoAd.numero}º TA ({rotuloTipoAditamento(ultimoAd.tipo)})
                {ultimoAd.percentualReajuste != null && ` ${ultimoAd.percentualReajuste.toFixed(2).replace('.', ',')}% ${ultimoAd.indiceReajuste || ''}`}
              </span>
            )}
          </div>

          {contrato.objeto && (
            <div style={{
              fontSize: 12, color: '#475569',
              background: '#fff', padding: 10, borderRadius: 6,
              border: '1px solid #e5e7eb', marginBottom: 10,
            }}>
              <strong>Objeto:</strong> {contrato.objeto}
            </div>
          )}

          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            padding: '8px 12px', background: '#f0fdf4',
            border: '1px solid #bbf7d0', borderRadius: 6, marginBottom: 10,
          }}>
            <div>
              <div style={{ fontSize: 10, color: '#166534', fontWeight: 600, letterSpacing: 0.3 }}>VALOR TOTAL ATUAL</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#047857' }}>{fmtReal(totalAtual)}</div>
            </div>
            {contrato.valorTotalOriginal != null && contrato.valorTotalOriginal !== totalAtual && (
              <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b' }}>
                <div>Valor original: {fmtReal(contrato.valorTotalOriginal)}</div>
                <div style={{ color: '#047857', fontWeight: 600 }}>
                  +{fmtReal(totalAtual - contrato.valorTotalOriginal)} ({(((totalAtual / contrato.valorTotalOriginal) - 1) * 100).toFixed(2).replace('.', ',')}%)
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {contrato.arquivoUrl && (
              <a href={contrato.arquivoUrl} target="_blank" rel="noreferrer" style={{
                ...acaoStyle('#4AABDB'),
                display: 'inline-flex', alignItems: 'center',
              }}>
                📄 PDF
              </a>
            )}
            {itens.length > 0 && (
              <button onClick={(e) => { e.stopPropagation() }} style={{
                ...acaoStyle('#047857'),
                cursor: 'default',
              }}>
                {itens.length} {itens.length === 1 ? 'item' : 'itens'}
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); onEditar() }} style={acaoStyle('#2D3A6B')}>Editar</button>
            <button onClick={(e) => { e.stopPropagation(); onExcluir() }} style={{
              ...acaoStyle('#dc2626'),
              background: 'transparent', color: '#dc2626', border: '1px solid #fecaca',
            }}>Excluir</button>
          </div>

          {itens.length > 0 && (
            <div style={{ marginTop: 12, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{
                padding: '8px 12px', background: '#f1f5f9',
                fontSize: 11, fontWeight: 700, color: '#334155',
                borderBottom: '1px solid #e5e7eb',
              }}>
                ITENS / ROTAS VIGENTES ({itens.length})
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>Descrição</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Qtd</th>
                      <th style={thStyle}>Unidade</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Valor Unit.</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Valor Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((it, idx) => (
                      <tr key={it.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={tdStyle}>{String(idx + 1).padStart(2, '0')}</td>
                        <td style={{ ...tdStyle, fontWeight: 600, color: '#1e293b' }}>{it.descricao}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{it.quantidade != null ? fmtNum(it.quantidade) : '—'}</td>
                        <td style={tdStyle}>{it.unidade || '—'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{it.valorUnitario != null ? fmtReal4(it.valorUnitario) : '—'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{it.valorTotal != null ? fmtReal(it.valorTotal) : '—'}</td>
                      </tr>
                    ))}
                    <tr style={{ background: '#f0fdf4', borderTop: '2px solid #bbf7d0' }}>
                      <td style={{ ...tdStyle, fontWeight: 700, color: '#047857' }} colSpan={5}>TOTAL GERAL</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#047857' }}>{fmtReal(totalAtual)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const AlertaTopo = ({ cor, bg, borda, textoCor, emoji, titulo, sub }: {
  cor: string; bg: string; borda: string; textoCor: string; emoji: string; titulo: string; sub: string
}) => (
  <div style={{
    marginBottom: 14, padding: '14px 18px', background: bg,
    border: `1px solid ${borda}`, borderLeft: `4px solid ${cor}`, borderRadius: 8,
    display: 'flex', alignItems: 'center', gap: 12,
  }}>
    <span style={{ fontSize: 24 }}>{emoji}</span>
    <div>
      <div style={{ fontWeight: 700, color: textoCor }}>{titulo}</div>
      <div style={{ fontSize: 13, color: textoCor, opacity: 0.8, marginTop: 2 }}>{sub}</div>
    </div>
  </div>
)

const KPI = ({ titulo, valor, cor, onClick, ativo }: {
  titulo: string
  valor: string
  cor: string
  onClick?: () => void
  ativo?: boolean
}) => {
  const clicavel = !!onClick
  return (
    <div
      onClick={onClick}
      role={clicavel ? 'button' : undefined}
      tabIndex={clicavel ? 0 : undefined}
      onKeyDown={clicavel ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick && onClick()
        }
      } : undefined}
      onMouseEnter={(e) => {
        if (clicavel && !ativo) {
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }
      }}
      onMouseLeave={(e) => {
        if (clicavel && !ativo) {
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'
          e.currentTarget.style.transform = 'translateY(0)'
        }
      }}
      style={{
        background: ativo ? '#fafbfd' : '#fff',
        padding: 16,
        borderRadius: 12,
        borderTop: `${ativo ? 4 : 3}px solid ${cor}`,
        boxShadow: ativo
          ? `0 0 0 2px ${cor}, 0 4px 12px rgba(0,0,0,0.08)`
          : '0 1px 3px rgba(0,0,0,0.05)',
        cursor: clicavel ? 'pointer' : 'default',
        transition: 'all 0.15s',
        userSelect: 'none',
        outline: 'none',
        position: 'relative',
      }}
    >
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8,
      }}>
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {titulo}
        </div>
        {ativo && (
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
            background: cor, color: '#fff',
            padding: '2px 6px', borderRadius: 3,
            whiteSpace: 'nowrap',
          }}>● FILTRADO</span>
        )}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: cor, marginTop: 6 }}>{valor}</div>
      {clicavel && !ativo && (
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
          clique para filtrar
        </div>
      )}
      {ativo && (
        <div style={{ fontSize: 10, color: cor, marginTop: 4, fontWeight: 600 }}>
          clique novamente para limpar
        </div>
      )}
    </div>
  )
}

// Header button DARK
const headerBtn: React.CSSProperties = {
  background: 'rgba(74,158,255,0.10)',
  color: C.ink,
  padding: '8px 16px',
  borderRadius: 8,
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 600,
  border: `1px solid ${C.border}`,
  transition: 'all 0.15s',
}

const selectStyle: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8,
  fontSize: 14, background: '#fff', fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
}

const acaoStyle = (cor: string): React.CSSProperties => ({
  padding: '8px 14px', background: cor, color: '#fff', border: 'none',
  borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  textDecoration: 'none', fontFamily: 'inherit',
})

const thStyle: React.CSSProperties = {
  padding: '8px 12px', textAlign: 'left', fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
  padding: '8px 12px', color: '#334155',
}
