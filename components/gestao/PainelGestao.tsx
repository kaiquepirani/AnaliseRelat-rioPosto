'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  BarChart, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, LabelList, Legend, Cell, ReferenceLine,
} from 'recharts'
import {
  BASES_PADRAO, consolidar, MULTIPLICADOR_ENCARGOS, ANO_GESTAO,
  type ConsolidadoCompleto, type ConsolidadoBase, type VinculosPostos,
} from '@/lib/gestao-types'

interface Props {
  token: string
  onLogout: () => void
}

const NOMES_MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const fmtReal = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtRealK = (n: number) => {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(2).replace('.', ',')}M`
  if (abs >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}K`
  return fmtReal(n)
}
const fmtPctSimples = (n: number) => `${n.toFixed(1).replace('.', ',')}%`

const PALETA_BASES = [
  '#2D3A6B', '#4AABDB', '#10b981', '#f59e0b', '#7c3aed', '#dc2626',
  '#0891b2', '#ea580c', '#84cc16', '#ec4899', '#6366f1', '#14b8a6',
]

const corBase = (nomeBase: string, todasBases: string[]): string => {
  const idx = todasBases.indexOf(nomeBase)
  if (idx < 0) return '#94a3b8'
  return PALETA_BASES[idx % PALETA_BASES.length]
}

type Metrica = 'Receita' | 'Combustível' | 'Folha' | 'Margem' | 'Comparativo'
type ModoFiltro = 'todos' | 'top5' | 'custom'

const CORES_METRICA: { [k in Metrica]: string } = {
  Receita: '#10b981',
  'Combustível': '#dc2626',
  Folha: '#7c3aed',
  Margem: '#2D3A6B',
  Comparativo: '#475569',
}

// Tooltip customizado pro modo Comparativo (mostra a decomposição da receita)
const TooltipComparativo = ({ active, payload, label }: any) => {
  if (!active || !payload || payload.length === 0) return null
  const original = payload[0]?.payload || {}
  const receita = Number(original.Receita) || 0
  const combustivel = Number(original['Combustível']) || 0
  const folha = Number(original.Folha) || 0
  const margem = Number(original.Margem) || 0
  const margemPct = Number(original['Margem %']) || 0

  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: 8, padding: '10px 12px', fontSize: 12,
      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
      minWidth: 220,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, color: '#1e293b' }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px', alignItems: 'baseline' }}>
        <span style={{ color: '#64748b', fontWeight: 600 }}>Receita</span>
        <strong style={{ color: '#1e293b' }}>{fmtReal(receita)}</strong>
        <span style={{ color: '#dc2626' }}>− Combustível</span>
        <span style={{ color: '#dc2626' }}>{fmtReal(combustivel)}</span>
        <span style={{ color: '#7c3aed' }}>− Folha</span>
        <span style={{ color: '#7c3aed' }}>{fmtReal(folha)}</span>
        <span style={{ color: margem >= 0 ? '#047857' : '#dc2626', fontWeight: 700, borderTop: '1px solid #f1f5f9', paddingTop: 4 }}>= Margem</span>
        <strong style={{ color: margem >= 0 ? '#047857' : '#dc2626', borderTop: '1px solid #f1f5f9', paddingTop: 4 }}>{fmtReal(margem)}</strong>
        <span style={{ color: '#f59e0b' }}>Margem %</span>
        <strong style={{ color: '#f59e0b' }}>{fmtPctSimples(margemPct)}</strong>
      </div>
    </div>
  )
}

export default function PainelGestao({ token, onLogout }: Props) {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [comEncargos, setComEncargos] = useState(true)
  const [consolidado, setConsolidado] = useState<ConsolidadoCompleto | null>(null)

  const [metrica, setMetrica] = useState<Metrica>('Receita')
  const [modoFiltro, setModoFiltro] = useState<ModoFiltro>('todos')
  const [basesAtivas, setBasesAtivas] = useState<Set<string>>(new Set())

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const [resFat, resExt, resPag, resVinc] = await Promise.all([
        fetch('/api/faturamento', { headers }),
        fetch('/api/extratos', { headers }),
        fetch('/api/dp/pagamentos', { headers }),
        fetch('/api/vinculos-postos', { headers }),
      ])

      if (resFat.status === 401) { onLogout(); return }

      const faturamento = resFat.ok ? await resFat.json() : null
      const extratos = resExt.ok ? await resExt.json() : []
      const pagamentos = resPag.ok ? await resPag.json() : []
      const vinculosPostos: VinculosPostos = resVinc.ok ? await resVinc.json() : {}

      const cons = consolidar({
        ano: ANO_GESTAO,
        faturamento,
        extratos: Array.isArray(extratos) ? extratos : [],
        pagamentos: Array.isArray(pagamentos) ? pagamentos : [],
        bases: BASES_PADRAO,
        vinculosPostos,
      })
      setConsolidado(cons)
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar dados')
    } finally {
      setCarregando(false)
    }
  }, [headers, onLogout])

  useEffect(() => { carregar() }, [carregar])

  const fator = comEncargos ? MULTIPLICADOR_ENCARGOS : 1

  const valorBaseMes = (base: ConsolidadoBase, mesIdx: number, met: Metrica): number => {
    const m = base.meses[mesIdx]
    if (met === 'Receita') return m.receita
    if (met === 'Combustível') return m.combustivel
    if (met === 'Folha') return m.folhaLiquida * fator
    return m.receita - m.combustivel - (m.folhaLiquida * fator)
  }

  const valorBaseTotal = (base: ConsolidadoBase, met: Metrica): number => {
    if (met === 'Receita') return base.totalReceita
    if (met === 'Combustível') return base.totalCombustivel
    if (met === 'Folha') return base.totalFolhaLiquida * fator
    if (met === 'Comparativo') return base.totalReceita
    return base.totalReceita - base.totalCombustivel - (base.totalFolhaLiquida * fator)
  }

  const kpis = useMemo(() => {
    if (!consolidado) return null
    const t = consolidado.totaisGerais
    const folha = t.totalFolhaLiquida * fator
    const margem = t.totalReceita - t.totalCombustivel - folha
    const margemPct = t.totalReceita > 0 ? (margem / t.totalReceita) * 100 : 0
    return {
      receita: t.totalReceita,
      combustivel: t.totalCombustivel,
      folha,
      margem,
      margemPct,
      pctCombustivel: t.totalReceita > 0 ? (t.totalCombustivel / t.totalReceita) * 100 : 0,
      pctFolha: t.totalReceita > 0 ? (folha / t.totalReceita) * 100 : 0,
    }
  }, [consolidado, fator])

  const basesOrdenadas = useMemo(() => {
    if (!consolidado) return []
    const lista = consolidado.bases.slice()
    lista.sort((a, b) => valorBaseTotal(b, metrica) - valorBaseTotal(a, metrica))
    return lista
  }, [consolidado, metrica, fator])

  const top5BasesNomes = useMemo(() => basesOrdenadas.slice(0, 5).map(b => b.baseNome), [basesOrdenadas])
  const todasBasesNomes = useMemo(() => basesOrdenadas.map(b => b.baseNome), [basesOrdenadas])

  const basesParaGrafico = useMemo<string[]>(() => {
    if (modoFiltro === 'todos') return []
    if (modoFiltro === 'top5') return top5BasesNomes
    return basesOrdenadas.filter(b => basesAtivas.has(b.baseNome)).map(b => b.baseNome)
  }, [modoFiltro, top5BasesNomes, basesAtivas, basesOrdenadas])

  const basesParaSomar = useMemo<ConsolidadoBase[]>(() => {
    if (!consolidado) return []
    if (modoFiltro === 'todos') return consolidado.bases
    if (modoFiltro === 'top5') return consolidado.bases.filter(b => top5BasesNomes.indexOf(b.baseNome) >= 0)
    return consolidado.bases.filter(b => basesAtivas.has(b.baseNome))
  }, [consolidado, modoFiltro, top5BasesNomes, basesAtivas])

  const dadosGraficoEmpilhado = useMemo(() => {
    if (!consolidado) return []
    return NOMES_MESES.map((mes, i) => {
      const obj: any = { mes }
      if (modoFiltro === 'todos') {
        let total = 0
        for (const base of consolidado.bases) total += valorBaseMes(base, i, metrica)
        obj['__total__'] = total
      } else {
        for (const baseNome of basesParaGrafico) {
          const base = consolidado.bases.find(b => b.baseNome === baseNome)
          if (base) obj[baseNome] = valorBaseMes(base, i, metrica)
        }
      }
      return obj
    })
  }, [consolidado, metrica, modoFiltro, basesParaGrafico, fator])

  const dadosComparativo = useMemo(() => {
    return NOMES_MESES.map((mes, i) => {
      let receita = 0, combustivel = 0, folha = 0
      for (let j = 0; j < basesParaSomar.length; j++) {
        const m = basesParaSomar[j].meses[i]
        receita += m.receita
        combustivel += m.combustivel
        folha += m.folhaLiquida * fator
      }
      const margem = receita - combustivel - folha
      const margemPct = receita > 0 ? (margem / receita) * 100 : 0
      return {
        mes,
        Receita: receita,
        'Combustível': combustivel,
        Folha: folha,
        Margem: margem,
        'Margem %': margemPct,
      }
    })
  }, [basesParaSomar, fator])

  const totaisSelecionadas = useMemo(() => {
    let receita = 0, combustivel = 0, folha = 0
    for (let j = 0; j < basesParaSomar.length; j++) {
      const b = basesParaSomar[j]
      receita += b.totalReceita
      combustivel += b.totalCombustivel
      folha += b.totalFolhaLiquida * fator
    }
    const margem = receita - combustivel - folha
    const margemPct = receita > 0 ? (margem / receita) * 100 : 0
    return { receita, combustivel, folha, margem, margemPct, qtdBases: basesParaSomar.length }
  }, [basesParaSomar, fator])

  const toggleBase = (baseNome: string) => {
    const novo = new Set(basesAtivas)
    if (novo.has(baseNome)) novo.delete(baseNome)
    else novo.add(baseNome)
    setBasesAtivas(novo)
    setModoFiltro('custom')
  }

  const dadosTabela = useMemo(() => {
    if (!consolidado) return []
    return consolidado.bases.map(b => {
      const folha = b.totalFolhaLiquida * fator
      const margem = b.totalReceita - b.totalCombustivel - folha
      const margemPct = b.totalReceita > 0 ? (margem / b.totalReceita) * 100 : null
      return { ...b, folha, margem, margemPct }
    }).sort((a, b) => b.margem - a.margem)
  }, [consolidado, fator])

  // Ranking de margem % respeitando o filtro de bases (Todos/Top5/custom).
  // Inclui a média ponderada (Σmargem ÷ Σreceita) como referência pra
  // colorir cada barra: verde se acima da média, vermelho se abaixo,
  // âmbar se está perto (±2 pontos percentuais).
  const dadosRankingMargem = useMemo(() => {
    if (basesParaSomar.length === 0) {
      return { itens: [], mediaPonderada: 0 }
    }
    let receitaTotal = 0
    let margemTotal = 0
    const itens = basesParaSomar.map(b => {
      const folha = b.totalFolhaLiquida * fator
      const margem = b.totalReceita - b.totalCombustivel - folha
      const margemPct = b.totalReceita > 0 ? (margem / b.totalReceita) * 100 : null
      receitaTotal += b.totalReceita
      margemTotal += margem
      return {
        baseId: b.baseId,
        baseNome: b.baseNome,
        margem,
        margemPct,
        receita: b.totalReceita,
      }
    })
    const mediaPonderada = receitaTotal > 0 ? (margemTotal / receitaTotal) * 100 : 0

    // Ordena: bases com margemPct null no fim (sem dado), resto por margemPct desc
    itens.sort((a, b) => {
      if (a.margemPct == null && b.margemPct == null) return 0
      if (a.margemPct == null) return 1
      if (b.margemPct == null) return -1
      return b.margemPct - a.margemPct
    })
    return { itens, mediaPonderada }
  }, [basesParaSomar, fator])

  const ultimoMesComDado = useMemo(() => {
    if (!consolidado) return -1
    for (let i = 11; i >= 0; i--) {
      const m = consolidado.totaisPorMes[i]
      if ((m.receita + m.combustivel + m.folhaLiquida) > 0) return i
    }
    return -1
  }, [consolidado])

  const subtituloGrafico = useMemo(() => {
    if (metrica !== 'Comparativo') return 'Selecione a métrica e quais bases visualizar'
    const t = totaisSelecionadas
    if (t.qtdBases === 0) return 'Selecione pelo menos uma base nos chips abaixo'
    const escopo = modoFiltro === 'todos'
      ? `todas as ${t.qtdBases} bases`
      : modoFiltro === 'top5'
      ? `top 5 bases`
      : `${t.qtdBases} ${t.qtdBases === 1 ? 'base selecionada' : 'bases selecionadas'}`
    return `${escopo} · Margem total ${fmtReal(t.margem)} (${fmtPctSimples(t.margemPct)})`
  }, [metrica, totaisSelecionadas, modoFiltro])

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
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>📈 Gestão Operacional {ANO_GESTAO}</div>
            <div style={{ color: '#a8b5d9', fontSize: 12 }}>Receita × Custos por base operacional</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/" style={headerBtn}>← Início</Link>
          <button onClick={onLogout} style={{ ...headerBtn, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Sair</button>
        </div>
      </header>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>

        <div style={{
          background: '#fff', padding: 14, borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: 16,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Folha:</span>
            <button onClick={() => setComEncargos(false)} style={toggleStyle(!comEncargos, '#0369a1')}>
              Líquida
            </button>
            <button onClick={() => setComEncargos(true)} style={toggleStyle(comEncargos, '#7c3aed')}>
              × 1,7 (com encargos estimados)
            </button>
            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>
              {comEncargos
                ? 'simula INSS, FGTS, férias, 13º — aproximação para visão de custo real'
                : 'apenas o líquido pago, sem encargos'}
            </span>
          </div>
          <button onClick={carregar} disabled={carregando} style={{
            padding: '8px 16px', background: carregando ? '#94a3b8' : '#10b981',
            color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: carregando ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}>
            {carregando ? '⏳ Atualizando...' : '🔄 Atualizar dados'}
          </button>
        </div>

        {erro && (
          <div style={{
            padding: 14, background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 8, color: '#991b1b', fontSize: 13, marginBottom: 16,
          }}>{erro}</div>
        )}

        {carregando && !consolidado ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 12 }}>
            Carregando dados das 3 fontes...
          </div>
        ) : consolidado && kpis ? (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12, marginBottom: 16,
            }}>
              <KPI titulo={`Receita ${ANO_GESTAO}`}
                valor={fmtReal(kpis.receita)}
                sub={ultimoMesComDado >= 0 ? `acumulado até ${NOMES_MESES[ultimoMesComDado]}` : ''}
                cor="#047857" icone="💰" />
              <KPI titulo="Custo combustível"
                valor={fmtReal(kpis.combustivel)}
                sub={`${fmtPctSimples(kpis.pctCombustivel)} da receita`}
                cor="#dc2626" icone="⛽" />
              <KPI titulo={`Custo folha${comEncargos ? ' (×1,7)' : ' líquida'}`}
                valor={fmtReal(kpis.folha)}
                sub={`${fmtPctSimples(kpis.pctFolha)} da receita`}
                cor="#7c3aed" icone="👥" />
              <KPI titulo="Margem operacional"
                valor={fmtReal(kpis.margem)}
                sub={`${fmtPctSimples(kpis.margemPct)} da receita`}
                cor={kpis.margem >= 0 ? '#10b981' : '#dc2626'}
                icone={kpis.margem >= 0 ? '📊' : '📉'} />
            </div>

            {(consolidado.postosOrfaos.length > 0 ||
              consolidado.faturamentoLinhasOrfas.length > 0 ||
              consolidado.folhaCidadesOrfas.length > 0) && (
              <div style={{
                marginBottom: 16, padding: '12px 16px',
                background: '#fffbeb', border: '1px solid #fde68a',
                borderLeft: '4px solid #f59e0b', borderRadius: 8,
                fontSize: 13, color: '#92400e',
              }}>
                <strong>⚠️ Itens encontrados nos dados que não foram atribuídos a nenhuma base:</strong>
                {consolidado.postosOrfaos.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    <strong>Postos:</strong> {consolidado.postosOrfaos.join(' · ')}
                  </div>
                )}
                {consolidado.faturamentoLinhasOrfas.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 12 }}>
                    <strong>Linhas de faturamento:</strong> {consolidado.faturamentoLinhasOrfas.join(' · ')}
                  </div>
                )}
                {consolidado.folhaCidadesOrfas.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 12 }}>
                    <strong>Cidades de folha (em pagamentos):</strong> {consolidado.folhaCidadesOrfas.join(' · ')}
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: 11, opacity: 0.85 }}>
                  Postos podem ser vinculados manualmente pelo dashboard de combustível. Cidades de folha e linhas de faturamento são ajustadas em <code>lib/gestao-types.ts</code>.
                </div>
              </div>
            )}

            <Secao titulo={`📊 Evolução mensal — ${ANO_GESTAO}`} sub={subtituloGrafico}>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700, alignSelf: 'center', textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 4 }}>
                  Métrica:
                </span>
                {(['Receita', 'Combustível', 'Folha', 'Margem', 'Comparativo'] as Metrica[]).map(m => (
                  <button key={m} onClick={() => setMetrica(m)}
                    style={chipStyle(metrica === m, CORES_METRICA[m])}>
                    {m === 'Comparativo' ? '📊 Comparativo' : m}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700, alignSelf: 'center', textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 4 }}>
                  Bases:
                </span>
                <button onClick={() => { setModoFiltro('todos'); setBasesAtivas(new Set()) }}
                  style={chipStyle(modoFiltro === 'todos', '#2D3A6B')}>
                  Todos
                </button>
                <button onClick={() => { setModoFiltro('top5'); setBasesAtivas(new Set()) }}
                  style={chipStyle(modoFiltro === 'top5', '#4AABDB')}>
                  Top 5
                </button>
                {basesOrdenadas.map(b => {
                  const ativo = modoFiltro === 'custom' && basesAtivas.has(b.baseNome)
                  const cor = corBase(b.baseNome, todasBasesNomes)
                  return (
                    <button key={b.baseId} onClick={() => toggleBase(b.baseNome)}
                      title={`${b.baseNome} — ${fmtReal(valorBaseTotal(b, metrica))}`}
                      style={chipStyle(ativo, cor)}>
                      {b.baseNome}
                    </button>
                  )
                })}
              </div>

              <div style={{ width: '100%', height: 400 }}>
                <ResponsiveContainer width="100%" height="100%">
                  {metrica === 'Comparativo' ? (
                    <ComposedChart data={dadosComparativo} margin={{ top: 26, right: 60, left: 10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" tickFormatter={fmtRealK} tick={{ fontSize: 11 }} width={70} />
                      <YAxis yAxisId="right" orientation="right"
                        tickFormatter={(v: any) => `${Math.round(Number(v))}%`}
                        tick={{ fontSize: 11, fill: '#f59e0b' }}
                        width={50} />
                      <Tooltip content={<TooltipComparativo />} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="rect" />
                      <Bar yAxisId="left" dataKey="Combustível" stackId="custos" fill="#dc2626" />
                      <Bar yAxisId="left" dataKey="Folha" stackId="custos" fill="#7c3aed" />
                      <Bar yAxisId="left" dataKey="Margem" stackId="custos" fill="#10b981" radius={[6, 6, 0, 0]}>
                        <LabelList dataKey="Receita" position="top" formatter={fmtRealK}
                          style={{ fontSize: 10, fill: '#334155', fontWeight: 700 }} />
                      </Bar>
                      <Line yAxisId="right" type="monotone" dataKey="Margem %"
                        stroke="#f59e0b" strokeWidth={2.5}
                        dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }}
                        activeDot={{ r: 6 }} />
                    </ComposedChart>
                  ) : (
                    <BarChart data={dadosGraficoEmpilhado} margin={{ top: 20, right: 20, left: 10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={fmtRealK} tick={{ fontSize: 11 }} width={70} />
                      <Tooltip
                        formatter={(v: any, name: any) => [fmtReal(Number(v)), name === '__total__' ? `Total ${metrica}` : name]}
                        contentStyle={{ borderRadius: 8, fontSize: 12, maxWidth: 320 }}
                        labelStyle={{ fontWeight: 600 }}
                        itemSorter={(item: any) => -Number(item.value)}
                      />
                      {modoFiltro === 'todos' ? (
                        <Bar dataKey="__total__" fill={CORES_METRICA[metrica]} radius={[6, 6, 0, 0]} name={metrica}>
                          <LabelList dataKey="__total__" position="top" formatter={fmtRealK}
                            style={{ fontSize: 10, fill: '#334155', fontWeight: 600 }} />
                        </Bar>
                      ) : (
                        basesParaGrafico.map(baseNome => (
                          <Bar key={baseNome} dataKey={baseNome} stackId="a"
                            fill={corBase(baseNome, todasBasesNomes)}
                            name={baseNome} />
                        ))
                      )}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>

              {metrica === 'Comparativo' && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
                  Cada barra mostra a decomposição da receita: <span style={{ color: '#dc2626', fontWeight: 600 }}>Combustível</span> + <span style={{ color: '#7c3aed', fontWeight: 600 }}>Folha</span> + <span style={{ color: '#10b981', fontWeight: 600 }}>Margem</span>. O número no topo é a receita total. A linha <span style={{ color: '#f59e0b', fontWeight: 600 }}>laranja</span> é a margem em %.
                </div>
              )}

              {metrica !== 'Comparativo' && modoFiltro !== 'todos' && basesParaGrafico.length > 0 && (
                <div style={{
                  marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8,
                  paddingTop: 10, borderTop: '1px solid #f1f5f9',
                }}>
                  {basesParaGrafico.map(baseNome => (
                    <div key={baseNome} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 11, color: '#475569',
                    }}>
                      <span style={{
                        width: 10, height: 10, borderRadius: 2,
                        background: corBase(baseNome, todasBasesNomes), flexShrink: 0,
                      }} />
                      {baseNome}
                    </div>
                  ))}
                </div>
              )}

              {modoFiltro === 'custom' && basesAtivas.size === 0 && (
                <div style={{
                  marginTop: 14, padding: 16, textAlign: 'center',
                  color: '#94a3b8', fontSize: 12,
                  background: '#f8fafc', borderRadius: 6, border: '1px dashed #e2e8f0',
                }}>
                  Nenhuma base selecionada. Clique nos chips acima para escolher quais visualizar.
                </div>
              )}
            </Secao>

            {/* ── Ranking de Margem % por Base ────────────────────────────── */}
            {dadosRankingMargem.itens.length > 0 && (() => {
              const { itens, mediaPonderada } = dadosRankingMargem
              const TOLERANCIA = 2 // ±2 p.p. da média conta como "perto da média"
              const corDaMargem = (pct: number | null): string => {
                if (pct == null) return '#cbd5e1'
                const diff = pct - mediaPonderada
                if (diff > TOLERANCIA) return '#10b981'  // verde — acima
                if (diff < -TOLERANCIA) return '#dc2626' // vermelho — abaixo
                return '#f59e0b'                          // âmbar — perto
              }
              const acima = itens.filter(i => i.margemPct != null && (i.margemPct - mediaPonderada) > TOLERANCIA).length
              const naMedia = itens.filter(i => i.margemPct != null && Math.abs(i.margemPct - mediaPonderada) <= TOLERANCIA).length
              const abaixo = itens.filter(i => i.margemPct != null && (i.margemPct - mediaPonderada) < -TOLERANCIA).length

              const subtitulo = `Média ponderada: ${fmtPctSimples(mediaPonderada)} · ${acima} acima · ${naMedia} na média · ${abaixo} abaixo`

              // Altura: 40px por base, mínimo 240px
              const alturaGrafico = Math.max(240, itens.length * 40)

              return (
                <Secao
                  titulo="🏁 Ranking de Margem % por base"
                  sub={subtitulo}
                >
                  <div style={{ width: '100%', height: alturaGrafico }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={itens}
                        layout="vertical"
                        margin={{ top: 6, right: 56, left: 8, bottom: 6 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                        <XAxis
                          type="number"
                          tick={{ fontSize: 11 }}
                          tickFormatter={(v: any) => `${Math.round(Number(v))}%`}
                          domain={[
                            (dataMin: number) => Math.min(0, Math.floor(dataMin - 5)),
                            (dataMax: number) => Math.ceil(dataMax + 5),
                          ]}
                        />
                        <YAxis
                          type="category"
                          dataKey="baseNome"
                          tick={{ fontSize: 12, fontWeight: 500 }}
                          width={140}
                        />
                        <Tooltip
                          formatter={(v: any) => [
                            v == null ? '—' : fmtPctSimples(Number(v)),
                            'Margem %',
                          ]}
                          contentStyle={{ fontSize: 12, borderRadius: 8 }}
                          labelStyle={{ fontWeight: 600, color: '#1e293b' }}
                          cursor={{ fill: 'rgba(45,58,107,0.04)' }}
                        />
                        <ReferenceLine
                          x={mediaPonderada}
                          stroke="#94a3b8"
                          strokeDasharray="4 4"
                          label={{
                            value: `Média ${fmtPctSimples(mediaPonderada)}`,
                            position: 'top',
                            fill: '#64748b',
                            fontSize: 10,
                            fontWeight: 600,
                          }}
                        />
                        <Bar dataKey="margemPct" radius={[0, 4, 4, 0]} barSize={22}>
                          {itens.map((item, i) => (
                            <Cell key={i} fill={corDaMargem(item.margemPct)} />
                          ))}
                          <LabelList
                            dataKey="margemPct"
                            position="right"
                            formatter={(v: any) => v == null ? '—' : fmtPctSimples(Number(v))}
                            style={{ fontSize: 11, fontWeight: 700, fill: '#334155' }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Legenda das cores */}
                  <div style={{
                    marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9',
                    display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: '#64748b',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 2, background: '#10b981' }} />
                      <span>Acima da média (&gt; +{TOLERANCIA} p.p.)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 2, background: '#f59e0b' }} />
                      <span>Próximo da média (±{TOLERANCIA} p.p.)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 2, background: '#dc2626' }} />
                      <span>Abaixo da média (&lt; −{TOLERANCIA} p.p.)</span>
                    </div>
                  </div>
                </Secao>
              )
            })()}

            <Secao titulo="🏢 Resultado por Base Operacional"
              sub="Ranqueado pela margem operacional absoluta">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      <th style={thStyle}>Base</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Receita</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Combustível</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Folha</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Margem R$</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Margem %</th>
                      <th style={thStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dadosTabela.map(b => {
                      const incompleto = !b.temFaturamentoMapeado || !b.temFolhaMapeada || !b.temPostoMapeado
                      const naoEncontrou =
                        b.postosMapeadosNaoEncontrados.length > 0 ||
                        b.folhaCidadesMapeadasNaoEncontradas.length > 0 ||
                        b.faturamentoLinhasMapeadasNaoEncontradas.length > 0

                      return (
                        <tr key={b.baseId} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ ...tdStyle, fontWeight: 600, color: '#1e293b' }}>
                            <span style={{
                              display: 'inline-block', width: 10, height: 10,
                              borderRadius: 2, background: corBase(b.baseNome, todasBasesNomes),
                              marginRight: 8, verticalAlign: 'middle',
                            }} />
                            {b.baseNome}
                            {b.observacao && (
                              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, fontWeight: 400, marginLeft: 18 }}>
                                {b.observacao}
                              </div>
                            )}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                            {b.totalReceita > 0 ? fmtRealK(b.totalReceita) : '—'}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: '#dc2626' }}>
                            {b.totalCombustivel > 0 ? fmtRealK(b.totalCombustivel) : '—'}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: '#7c3aed' }}>
                            {b.folha > 0 ? fmtRealK(b.folha) : '—'}
                          </td>
                          <td style={{
                            ...tdStyle, textAlign: 'right', fontWeight: 700,
                            color: b.margem >= 0 ? '#047857' : '#dc2626',
                          }}>
                            {fmtRealK(b.margem)}
                          </td>
                          <td style={{
                            ...tdStyle, textAlign: 'right', fontWeight: 600,
                            color: b.margemPct == null ? '#94a3b8' : (b.margemPct >= 0 ? '#047857' : '#dc2626'),
                          }}>
                            {b.margemPct == null ? '—' : fmtPctSimples(b.margemPct)}
                          </td>
                          <td style={tdStyle}>
                            {incompleto || naoEncontrou ? (
                              <span style={{
                                fontSize: 10, padding: '2px 6px',
                                background: '#fef3c7', color: '#92400e',
                                borderRadius: 3, fontWeight: 600,
                              }} title={
                                naoEncontrou
                                  ? `Mapeado mas sem dado: ${[
                                      ...b.postosMapeadosNaoEncontrados.map(p => `posto "${p}"`),
                                      ...b.folhaCidadesMapeadasNaoEncontradas.map(c => `folha "${c}"`),
                                      ...b.faturamentoLinhasMapeadasNaoEncontradas.map(l => `faturamento "${l}"`),
                                    ].join(', ')}`
                                  : 'Mapeamento incompleto'
                              }>
                                ⚠ Parcial
                              </span>
                            ) : (
                              <span style={{
                                fontSize: 10, padding: '2px 6px',
                                background: '#dcfce7', color: '#166534',
                                borderRadius: 3, fontWeight: 600,
                              }}>✓ Completa</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 10, fontSize: 10, color: '#94a3b8' }}>
                Passe o mouse sobre &ldquo;⚠ Parcial&rdquo; para ver quais itens do mapeamento ainda não têm dados.
              </div>
            </Secao>

            <div style={{
              marginTop: 16, padding: 12, background: '#fff', borderRadius: 8,
              fontSize: 11, color: '#94a3b8', display: 'flex', flexWrap: 'wrap',
              justifyContent: 'space-between', gap: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <span>📦 {consolidado.fontes.qtdExtratos} extratos · {consolidado.fontes.qtdPagamentos} pagamentos em {ANO_GESTAO} · {consolidado.fontes.qtdLinhasFaturamento} linhas de faturamento</span>
              <span>🕐 Atualizado: {new Date(consolidado.ultimaAtualizacao).toLocaleString('pt-BR')}</span>
            </div>
          </>
        ) : null}

      </main>
    </div>
  )
}

const KPI = ({ titulo, valor, sub, cor, icone }: {
  titulo: string; valor: string; sub?: string; cor: string; icone: string
}) => (
  <div style={{
    background: '#fff', padding: 16, borderRadius: 12,
    borderTop: `4px solid ${cor}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    minWidth: 0,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {titulo}
      </div>
      <span style={{ fontSize: 20 }}>{icone}</span>
    </div>
    <div style={{ fontSize: 22, fontWeight: 700, color: cor, marginTop: 8, wordBreak: 'break-word' }}>{valor}</div>
    {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{sub}</div>}
  </div>
)

const Secao = ({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) => (
  <div style={{
    background: '#fff', borderRadius: 12, padding: 16, marginBottom: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  }}>
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{titulo}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
    {children}
  </div>
)

const headerBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.12)', color: '#fff', padding: '8px 14px',
  borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600,
}

const toggleStyle = (ativo: boolean, cor: string): React.CSSProperties => ({
  padding: '6px 12px',
  background: ativo ? cor : '#fff',
  color: ativo ? '#fff' : '#334155',
  border: `1.5px solid ${ativo ? cor : '#e2e8f0'}`,
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
})

const chipStyle = (ativo: boolean, cor: string): React.CSSProperties => ({
  padding: '5px 11px',
  background: ativo ? cor : '#fff',
  color: ativo ? '#fff' : '#334155',
  border: `1.5px solid ${ativo ? cor : '#e2e8f0'}`,
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  transition: 'all 0.15s',
})

const thStyle: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', color: '#334155', whiteSpace: 'nowrap',
}
