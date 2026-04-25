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

interface Props {
  token: string
  onLogout: () => void
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
  if (s === 'em_renovacao')  return { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' }
  if (s === 'encerrado')     return { bg: '#f3f4f6', border: '#e5e7eb', text: '#4b5563' }
  return { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' }
}

const rotuloSituacao = (s: ContratoComAlerta['situacao']) => {
  if (s === 'vencido')       return 'VENCIDO'
  if (s === 'vencendo')      return 'VENCENDO'
  if (s === 'em_renovacao')  return 'EM RENOVAÇÃO'
  if (s === 'encerrado')     return 'ENCERRADO'
  return 'VIGENTE'
}

type Aba = 'resumo' | 'contratos' | 'faturamento'
type FiltroSituacao = 'ativos' | 'todos' | 'vigente' | 'vencendo' | 'vencido' | 'encerrado' | 'em_renovacao'

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
    return contratosComAlerta.filter(c => {
      if (filtroSituacao === 'ativos') {
        if (c.situacao === 'encerrado') return false
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
  }, [contratosComAlerta, filtroSituacao, filtroCidade, busca])

  const kpis = useMemo(() => {
    const vigentes = contratosComAlerta.filter(c => c.situacao === 'vigente' || c.situacao === 'vencendo')
    const vencendo = contratosComAlerta.filter(c => c.situacao === 'vencendo')
    const vencidos = contratosComAlerta.filter(c => c.situacao === 'vencido')
    const valorTotal = vigentes.reduce((acc, c) => acc + valorTotalAtual(c), 0)
    return { vigentes: vigentes.length, vencendo: vencendo.length, vencidos: vencidos.length, valorTotal }
  }, [contratosComAlerta])

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
    try {
      const tamanhoMB = (file.size / 1024 / 1024).toFixed(2)
      if (file.size > 25 * 1024 * 1024) {
        alert(`Arquivo muito grande (${tamanhoMB} MB). O limite é 25 MB.`)
        return
      }

      const fdUp = new FormData()
      fdUp.append('file', file)
      const rUp = await fetch('/api/contratos/upload', {
        method: 'POST', headers, body: fdUp,
      })
      if (!rUp.ok) {
        const dUp = await rUp.json().catch(() => ({}))
        alert(dUp.erro || `Falha ao enviar o PDF (status ${rUp.status})`)
        return
      }
      const upData = await rUp.json()

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
        file,
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
    <div style={{ minHeight: '100vh', background: '#f4f6fb', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <header style={{
        background: '#2D3A6B', padding: '16px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Image src="/logo.png" alt="ETCO" width={48} height={48}
            style={{ objectFit: 'contain', background: '#fff', borderRadius: 8, padding: 4 }} />
          <div>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>Painel de Contratos</div>
            <div style={{ color: '#a8b5d9', fontSize: 12 }}>Gestão de contratos vigentes</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/" style={headerBtn}>← Início</Link>
          <button onClick={onLogout} style={{ ...headerBtn, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Sair</button>
        </div>
      </header>

      {/* ABAS */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e5e7eb',
        padding: '0 24px', display: 'flex', gap: 4,
        position: 'sticky', top: 0, zIndex: 10,
        overflowX: 'auto',
      }}>
        <BotaoAba ativo={abaAtiva === 'resumo'} onClick={() => setAbaAtiva('resumo')}
          icone="📊" label="Resumo" />
        <BotaoAba ativo={abaAtiva === 'contratos'} onClick={() => setAbaAtiva('contratos')}
          icone="📋" label="Contratos" />
        <BotaoAba ativo={abaAtiva === 'faturamento'} onClick={() => setAbaAtiva('faturamento')}
          icone="💵" label="Faturamento" />
      </div>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>

        {abaAtiva === 'faturamento' ? (
          <FaturamentoPainel token={token} onLogout={onLogout} />
        ) : carregando ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 12 }}>
            Carregando...
          </div>
        ) : abaAtiva === 'resumo' ? (
          <ResumoContratos contratos={contratos} />
        ) : (
          <>
            {/* AVISOS NO TOPO DA ABA CONTRATOS */}
            {kpis.vencendo > 0 && (
              <AlertaTopo cor="#f59e0b" bg="#fffbeb" borda="#fde68a" textoCor="#92400e"
                emoji="⚠️"
                titulo={`${kpis.vencendo === 1 ? '1 contrato vence' : `${kpis.vencendo} contratos vencem`} nos próximos 30 dias`}
                sub="Revise e providencie a renovação antes do vencimento." />
            )}
            {kpis.vencidos > 0 && (
              <AlertaTopo cor="#dc2626" bg="#fef2f2" borda="#fecaca" textoCor="#991b1b"
                emoji="🚨"
                titulo={`${kpis.vencidos === 1 ? '1 contrato está vencido' : `${kpis.vencidos} contratos estão vencidos`}`}
                sub="Atualize o status (renovado ou encerrado) para manter o painel correto." />
            )}

            {/* KPIs RÁPIDOS */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 14, marginBottom: 20,
            }}>
              <KPI titulo="Contratos vigentes" valor={String(kpis.vigentes)} cor="#2D3A6B" />
              <KPI titulo="Vencendo em 30 dias" valor={String(kpis.vencendo)} cor="#f59e0b" />
              <KPI titulo="Vencidos" valor={String(kpis.vencidos)} cor="#dc2626" />
              <KPI titulo="Valor total vigente" valor={fmtReal(kpis.valorTotal)} cor="#4AABDB" />
            </div>

            {/* FILTROS E AÇÕES */}
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
                <option value="vigente">Vigentes</option>
                <option value="vencendo">Vencendo</option>
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
              }}>
                {importando ? '✨ Analisando PDF...' : '✨ Importar PDF (IA)'}
              </button>
              <button onClick={abrirNovo} style={{
                padding: '10px 16px', background: '#2D3A6B', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>+ Novo manual</button>
            </div>

            {/* LISTA DE CONTRATOS */}
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
              <div style={{ display: 'grid', gap: 14 }}>
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

const BotaoAba = ({ ativo, onClick, icone, label }: {
  ativo: boolean; onClick: () => void; icone: string; label: string
}) => (
  <button onClick={onClick} style={{
    padding: '14px 20px',
    background: 'transparent',
    color: ativo ? '#2D3A6B' : '#64748b',
    border: 'none',
    borderBottom: `3px solid ${ativo ? '#2D3A6B' : 'transparent'}`,
    fontSize: 14, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: 8,
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  }}>
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

  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: 18,
      borderLeft: `4px solid ${cor.text}`,
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      opacity: contrato.situacao === 'encerrado' ? 0.7 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
              background: cor.bg, color: cor.text, border: `1px solid ${cor.border}`,
              padding: '3px 8px', borderRadius: 4,
            }}>{rotuloSituacao(contrato.situacao)}</span>
            {contrato.numero && (
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Nº {contrato.numero}</span>
            )}
            <span style={{
              fontSize: 11, fontWeight: 600, color: '#7c3aed',
              background: '#f5f3ff', border: '1px solid #ddd6fe',
              padding: '2px 8px', borderRadius: 4,
            }}>📋 {rotuloAditamentoAtual(contrato)}</span>
          </div>

          <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginTop: 8 }}>
            {contrato.contratante || contrato.cliente}
          </div>
          {contrato.contratante && contrato.contratante !== contrato.cliente && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{contrato.cliente}</div>
          )}
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            {contrato.tipoServico}{contrato.cidade ? ` • ${contrato.cidade}` : ''}
            {contrato.cnpjContratante && <> • CNPJ {contrato.cnpjContratante}</>}
          </div>

          {ultimoAd && (
            <div style={{ fontSize: 12, color: corTipoAditamento(ultimoAd.tipo), marginTop: 6, fontWeight: 600 }}>
              Último: {ultimoAd.numero}º TA ({rotuloTipoAditamento(ultimoAd.tipo)})
              {ultimoAd.percentualReajuste != null && ` • ${ultimoAd.percentualReajuste.toFixed(2).replace('.', ',')}% ${ultimoAd.indiceReajuste || ''}`}
              {' '}em {fmtData(ultimoAd.data)}
            </div>
          )}
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {contrato.situacao === 'encerrado' ? 'Encerrado em' : 'Vencimento'}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: cor.text }}>
            {fmtData(contrato.situacao === 'encerrado' && contrato.dataEncerramento ? contrato.dataEncerramento : contrato.dataVencimento)}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {contrato.situacao === 'vencido'
              ? `Venceu há ${Math.abs(contrato.diasRestantes)} dia${Math.abs(contrato.diasRestantes) === 1 ? '' : 's'}`
              : contrato.situacao === 'encerrado' || contrato.situacao === 'em_renovacao'
              ? ''
              : `Faltam ${contrato.diasRestantes} dia${contrato.diasRestantes === 1 ? '' : 's'}`}
          </div>
        </div>
      </div>

      {contrato.objeto && (
        <div style={{
          marginTop: 14, fontSize: 13, color: '#475569',
          background: '#f8fafc', padding: 10, borderRadius: 6,
        }}>
          <strong>Objeto:</strong> {contrato.objeto}
        </div>
      )}

      <div style={{
        marginTop: 12, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        padding: '10px 14px', background: '#f0fdf4',
        border: '1px solid #bbf7d0', borderRadius: 8,
      }}>
        <div>
          <div style={{ fontSize: 11, color: '#166534', fontWeight: 600, letterSpacing: 0.3 }}>VALOR TOTAL ATUAL</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#047857' }}>{fmtReal(totalAtual)}</div>
        </div>
        {contrato.valorTotalOriginal != null && contrato.valorTotalOriginal !== totalAtual && (
          <div style={{ textAlign: 'right', fontSize: 12, color: '#64748b' }}>
            <div>Valor original: {fmtReal(contrato.valorTotalOriginal)}</div>
            <div style={{ color: '#047857', fontWeight: 600 }}>
              +{fmtReal(totalAtual - contrato.valorTotalOriginal)} ({(((totalAtual / contrato.valorTotalOriginal) - 1) * 100).toFixed(2).replace('.', ',')}%)
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        {contrato.arquivoUrl && (
          <a href={contrato.arquivoUrl} target="_blank" rel="noreferrer" style={{
            ...acaoStyle('#4AABDB'),
            display: 'inline-flex', alignItems: 'center',
          }}>
            📄 Abrir PDF
          </a>
        )}
        <button onClick={onToggle} style={acaoStyle(expandido ? '#64748b' : '#047857')}>
          {expandido ? '▲ Ocultar itens' : `🔍 Verificar ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`}
        </button>
        <button onClick={onEditar} style={acaoStyle('#2D3A6B')}>Editar</button>
        <button onClick={onExcluir} style={{
          ...acaoStyle('#dc2626'),
          background: 'transparent', color: '#dc2626', border: '1px solid #fecaca',
        }}>Excluir</button>
      </div>

      {expandido && itens.length > 0 && (
        <div style={{ marginTop: 16, background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{
            padding: '10px 14px', background: '#f1f5f9',
            fontSize: 12, fontWeight: 700, color: '#334155',
            borderBottom: '1px solid #e5e7eb',
          }}>
            ITENS / ROTAS VIGENTES ({itens.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 }}>
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

const KPI = ({ titulo, valor, cor }: { titulo: string; valor: string; cor: string }) => (
  <div style={{
    background: '#fff', padding: 16, borderRadius: 12,
    borderTop: `3px solid ${cor}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  }}>
    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {titulo}
    </div>
    <div style={{ fontSize: 22, fontWeight: 700, color: cor, marginTop: 6 }}>{valor}</div>
  </div>
)

const headerBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.12)', color: '#fff', padding: '8px 14px',
  borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600,
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
