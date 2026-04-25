'use client'
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LabelList,
} from 'recharts'
import type { FaturamentoCompleto, FaturamentoAno, FaturamentoMensal } from '@/lib/faturamento-types'
import { NOMES_MESES, calcularCrescimento } from '@/lib/faturamento-types'

interface Props {
  token: string
  onLogout: () => void
}

const fmtReal = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtRealK = (n: number) => {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(2).replace('.', ',')}M`
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}K`
  return fmtReal(n)
}
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1).replace('.', ',')}%`

const PALETA_ANOS = ['#94a3b8', '#4AABDB', '#10b981', '#f59e0b', '#7c3aed', '#dc2626']

// Paleta extensa pra 27+ cidades (cores distintas e legíveis)
const PALETA_CIDADES = [
  '#2D3A6B', '#4AABDB', '#10b981', '#f59e0b', '#7c3aed', '#dc2626',
  '#0891b2', '#ea580c', '#84cc16', '#ec4899', '#6366f1', '#14b8a6',
  '#eab308', '#f43f5e', '#8b5cf6', '#06b6d4', '#22c55e', '#f97316',
  '#a855f7', '#0ea5e9', '#65a30d', '#e11d48', '#3b82f6', '#d946ef',
  '#16a34a', '#fb923c', '#9333ea', '#0284c7', '#ca8a04',
]

const corCidade = (cidade: string, todasCidades: string[]): string => {
  const idx = todasCidades.indexOf(cidade)
  return PALETA_CIDADES[idx % PALETA_CIDADES.length]
}

export default function FaturamentoPainel({ token, onLogout }: Props) {
  const [dados, setDados] = useState<FaturamentoCompleto | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [importando, setImportando] = useState(false)
  const [anoSelecionado, setAnoSelecionado] = useState<number | null>(null)
  const [modoFiltro, setModoFiltro] = useState<'todos' | 'top10' | 'custom'>('todos')
  const [cidadesAtivas, setCidadesAtivas] = useState<Set<string>>(new Set())
  const inputFileRef = useRef<HTMLInputElement>(null)

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await fetch('/api/faturamento', { headers })
      if (r.status === 401) { onLogout(); return }
      const data: FaturamentoCompleto = await r.json()
      setDados(data)
      if (data.anos.length > 0 && anoSelecionado === null) {
        setAnoSelecionado(data.anos[data.anos.length - 1])
      }
    } finally {
      setCarregando(false)
    }
  }, [headers, onLogout, anoSelecionado])

  useEffect(() => { carregar() }, [carregar])

  const importar = async (file: File) => {
    setImportando(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/faturamento/importar', {
        method: 'POST', headers, body: fd,
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        alert(d.erro || `Erro ${r.status} na importação\n${d.detalhe || ''}`)
        return
      }
      const data = await r.json()
      alert(`✅ ${data.mensagem}\n\nLançamentos importados: ${data.totalLancamentos}\nAnos: ${data.anos.join(', ')}`)
      await carregar()
    } catch (err: any) {
      alert(`Erro inesperado: ${err?.message || 'desconhecido'}`)
    } finally {
      setImportando(false)
      if (inputFileRef.current) inputFileRef.current.value = ''
    }
  }

  if (carregando) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 12 }}>
        Carregando dados de faturamento...
      </div>
    )
  }

  if (!dados || dados.anos.length === 0) {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{
          padding: 60, textAlign: 'center', background: '#fff',
          borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
            Nenhum faturamento cadastrado ainda
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 8, marginBottom: 20 }}>
            Importe sua planilha de faturamento mensal para começar.<br />
            O Excel deve ter abas nomeadas como anos (2022, 2023, etc) com cidades nas linhas e meses nas colunas.
          </div>
          <input ref={inputFileRef} type="file"
            accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) importar(f) }} />
          <button onClick={() => inputFileRef.current?.click()} disabled={importando} style={{
            padding: '12px 24px', background: importando ? '#94a3b8' : '#7c3aed',
            color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: importando ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}>
            {importando ? '⏳ Importando...' : '📤 Importar Planilha Excel'}
          </button>
        </div>
      </div>
    )
  }

  // ==== Cálculos básicos ====
  const anos = dados.anos
  const anoAtual = anoSelecionado || anos[anos.length - 1]
  const anoAtualData = dados.porAno[anoAtual]
  const anoAnterior = anos.indexOf(anoAtual) > 0 ? anos[anos.indexOf(anoAtual) - 1] : null
  const anoAnteriorData = anoAnterior ? dados.porAno[anoAnterior] : null

  const ultimoMesComDado = (() => {
    if (!anoAtualData) return -1
    for (let i = 11; i >= 0; i--) {
      if (anoAtualData.totalPorMes[i] > 0) return i
    }
    return -1
  })()

  const crescimentoAnoAno = (() => {
    if (!anoAnteriorData || ultimoMesComDado < 0) return 0
    let acumAtual = 0
    let acumAnterior = 0
    for (let i = 0; i <= ultimoMesComDado; i++) {
      acumAtual += anoAtualData.totalPorMes[i] || 0
      acumAnterior += anoAnteriorData.totalPorMes[i] || 0
    }
    return calcularCrescimento(acumAnterior, acumAtual)
  })()

  const dadosBarrasMes = NOMES_MESES.map((mes, i) => ({
    mes,
    valor: anoAtualData.totalPorMes[i] || 0,
  }))

  const top10Cidades = anoAtualData.cidades.slice(0, 10)

  // ==== Lista global de cidades (todos os anos, ordenada alfabeticamente) ====
  const todasCidadesSet = new Set<string>()
  for (const ano of anos) {
    for (const c of dados.porAno[ano].cidades) todasCidadesSet.add(c.cidade)
  }
  const todasCidadesGlobal = Array.from(todasCidadesSet).sort()

  // ==== Cidades disponíveis no ano atual (ordenadas por total desc) ====
  const cidadesDoAno = anoAtualData.cidades

  // ==== Cidades selecionadas pra renderizar no gráfico ====
  let cidadesParaGrafico: string[] = []
  if (modoFiltro === 'todos') {
    cidadesParaGrafico = cidadesDoAno.map(c => c.cidade)
  } else if (modoFiltro === 'top10') {
    cidadesParaGrafico = top10Cidades.map(c => c.cidade)
  } else {
    // custom: usa o set
    cidadesParaGrafico = cidadesDoAno
      .filter(c => cidadesAtivas.has(c.cidade))
      .map(c => c.cidade)
  }

  // ==== Monta dados pra barras empilhadas ====
  // Cada item = { mes: 'Jan', cidade1: valor, cidade2: valor, ... }
  const dadosEmpilhado = NOMES_MESES.map((mes, i) => {
    const obj: any = { mes }
    if (modoFiltro === 'todos') {
      // Modo "Todos": uma única série com soma total
      obj['__total__'] = anoAtualData.totalPorMes[i] || 0
    } else {
      for (const cidade of cidadesParaGrafico) {
        const cid = anoAtualData.cidades.find(c => c.cidade === cidade)
        obj[cidade] = cid?.meses[i] ?? 0
      }
    }
    return obj
  })

  // ==== Toggle de uma cidade no modo custom ====
  const toggleCidade = (cidade: string) => {
    const novo = new Set(cidadesAtivas)
    if (novo.has(cidade)) novo.delete(cidade)
    else novo.add(cidade)
    setCidadesAtivas(novo)
    setModoFiltro('custom')
  }

  return (
    <div style={{ display: 'grid', gap: 16, width: '100%', minWidth: 0 }}>

      {/* === Cabeçalho === */}
      <div style={{
        background: '#fff', padding: 14, borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Ano:</label>
          <select value={anoAtual} onChange={e => setAnoSelecionado(Number(e.target.value))}
            style={{
              padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8,
              fontSize: 14, background: '#fff', fontFamily: 'inherit',
              outline: 'none', cursor: 'pointer', fontWeight: 600,
            }}>
            {anos.slice().reverse().map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          {dados.ultimaAtualizacao && (
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              Última atualização: {new Date(dados.ultimaAtualizacao).toLocaleDateString('pt-BR')}
            </span>
          )}
        </div>
        <input ref={inputFileRef} type="file"
          accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) importar(f) }} />
        <button onClick={() => inputFileRef.current?.click()} disabled={importando} style={{
          padding: '8px 16px', background: importando ? '#94a3b8' : '#7c3aed',
          color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
          cursor: importando ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
        }}>
          {importando ? '⏳ Importando...' : '📤 Atualizar planilha'}
        </button>
      </div>

      {/* === KPIs === */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 12,
      }}>
        <KPI titulo={`Total ${anoAtual}`} valor={fmtReal(anoAtualData.totalAnual)}
          sub={ultimoMesComDado >= 0 ? `até ${NOMES_MESES[ultimoMesComDado]}` : ''}
          cor="#047857" icone="💰" />
        <KPI titulo={ultimoMesComDado >= 0 ? `${NOMES_MESES[ultimoMesComDado]}/${String(anoAtual).slice(2)}` : 'Sem dados'}
          valor={ultimoMesComDado >= 0 ? fmtReal(anoAtualData.totalPorMes[ultimoMesComDado]) : '—'}
          sub="último mês com dados" cor="#2D3A6B" icone="📅" />
        {anoAnterior && (
          <KPI titulo={`vs ${anoAnterior}`}
            valor={fmtPct(crescimentoAnoAno)}
            sub="mesmo período"
            cor={crescimentoAnoAno >= 0 ? '#10b981' : '#dc2626'}
            icone={crescimentoAnoAno >= 0 ? '📈' : '📉'} />
        )}
        <KPI titulo="Cidades/Contratos" valor={String(anoAtualData.cidades.length)}
          sub={`em ${anoAtual}`} cor="#4AABDB" icone="🏙️" />
      </div>

      {/* === Gráfico: Barras empilhadas estilo combustível === */}
      <Secao titulo={`📊 Evolução Mensal por Contrato — ${anoAtual}`}
        sub='Selecione um contrato para ver isolado, ou "Todos" para ver o total geral'>

        {/* Chips de filtro */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          <button onClick={() => { setModoFiltro('todos'); setCidadesAtivas(new Set()) }}
            style={chipStyle(modoFiltro === 'todos', '#2D3A6B')}>
            Todos
          </button>
          <button onClick={() => { setModoFiltro('top10'); setCidadesAtivas(new Set()) }}
            style={chipStyle(modoFiltro === 'top10', '#4AABDB')}>
            Top 10
          </button>
          {cidadesDoAno.map(c => {
            const ativo = modoFiltro === 'custom' && cidadesAtivas.has(c.cidade)
            const cor = corCidade(c.cidade, todasCidadesGlobal)
            return (
              <button key={c.cidade} onClick={() => toggleCidade(c.cidade)}
                title={`${c.cidade} — ${fmtReal(c.total)}`}
                style={chipStyle(ativo, cor)}>
                {c.cidade}
              </button>
            )
          })}
        </div>

        {/* Gráfico */}
        <div style={{ width: '100%', height: 380 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dadosEmpilhado} margin={{ top: 20, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={fmtRealK} tick={{ fontSize: 11 }} width={70} />
              <Tooltip
                formatter={(v: any, name: any) => [fmtReal(Number(v)), name === '__total__' ? 'Total' : name]}
                contentStyle={{ borderRadius: 8, fontSize: 12, maxWidth: 320 }}
                labelStyle={{ fontWeight: 600 }}
                itemSorter={(item: any) => -Number(item.value)}
              />
              {modoFiltro === 'todos' ? (
                <Bar dataKey="__total__" fill="#2D3A6B" radius={[6, 6, 0, 0]} name="Total">
                  <LabelList dataKey="__total__" position="top" formatter={fmtRealK}
                    style={{ fontSize: 10, fill: '#334155', fontWeight: 600 }} />
                </Bar>
              ) : (
                cidadesParaGrafico.map(cidade => (
                  <Bar key={cidade} dataKey={cidade} stackId="a"
                    fill={corCidade(cidade, todasCidadesGlobal)}
                    name={cidade} />
                ))
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legenda customizada quando NÃO está em modo "todos" */}
        {modoFiltro !== 'todos' && cidadesParaGrafico.length > 0 && (
          <div style={{
            marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8,
            paddingTop: 10, borderTop: '1px solid #f1f5f9',
          }}>
            {cidadesParaGrafico.map(cidade => (
              <div key={cidade} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, color: '#475569',
              }}>
                <span style={{
                  width: 10, height: 10, borderRadius: 2,
                  background: corCidade(cidade, todasCidadesGlobal), flexShrink: 0,
                }} />
                {cidade}
              </div>
            ))}
          </div>
        )}

        {modoFiltro === 'custom' && cidadesAtivas.size === 0 && (
          <div style={{
            marginTop: 14, padding: 16, textAlign: 'center',
            color: '#94a3b8', fontSize: 12,
            background: '#f8fafc', borderRadius: 6, border: '1px dashed #e2e8f0',
          }}>
            Nenhum contrato selecionado. Clique nos chips acima para escolher quais visualizar.
          </div>
        )}
      </Secao>

      {/* === Gráfico: Barras simples do ano selecionado === */}
      <Secao titulo={`📊 Faturamento Mensal ${anoAtual}`}
        sub="Detalhamento mês a mês do ano selecionado">
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dadosBarrasMes} margin={{ top: 20, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={fmtRealK} tick={{ fontSize: 11 }} width={70} />
              <Tooltip formatter={(v: any) => fmtReal(Number(v))}
                contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="valor" fill="#2D3A6B" radius={[6, 6, 0, 0]}>
                <LabelList dataKey="valor" position="top" formatter={fmtRealK}
                  style={{ fontSize: 10, fill: '#334155', fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Secao>

      {/* === Tabela: Detalhamento por Cidade === */}
      <Secao titulo={`🏙️ Detalhamento por Cidade — ${anoAtual}`}
        sub={`${anoAtualData.cidades.length} contratos`}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                <th style={{ ...thStyle, position: 'sticky', left: 0, background: '#f8fafc', zIndex: 1 }}>Cidade</th>
                {NOMES_MESES.map(m => (
                  <th key={m} style={{ ...thStyle, textAlign: 'right' }}>{m}</th>
                ))}
                <th style={{ ...thStyle, textAlign: 'right', background: '#dbeafe' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {anoAtualData.cidades.map(c => (
                <tr key={c.cidade} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{
                    ...tdStyle, fontWeight: 600, color: '#1e293b',
                    position: 'sticky', left: 0, background: '#fff', zIndex: 1,
                  }}>{c.cidade}</td>
                  {c.meses.map((v, i) => (
                    <td key={i} style={{ ...tdStyle, textAlign: 'right', color: v == null ? '#cbd5e1' : '#334155' }}>
                      {v == null ? '—' : fmtRealK(v)}
                    </td>
                  ))}
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#047857', background: '#f0fdf4' }}>
                    {fmtReal(c.total)}
                  </td>
                </tr>
              ))}
              <tr style={{ background: '#f0fdf4', borderTop: '2px solid #bbf7d0' }}>
                <td style={{
                  ...tdStyle, fontWeight: 700, color: '#047857',
                  position: 'sticky', left: 0, background: '#f0fdf4',
                }}>TOTAL</td>
                {anoAtualData.totalPorMes.map((v, i) => (
                  <td key={i} style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#047857' }}>
                    {fmtRealK(v)}
                  </td>
                ))}
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#047857' }}>
                  {fmtReal(anoAtualData.totalAnual)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Secao>

      {/* === Top 10 Cidades === */}
      <Secao titulo={`🏆 Top 10 Maiores Faturamentos — ${anoAtual}`}
        sub="Cidades/contratos com maior receita no ano">
        <div style={{ display: 'grid', gap: 8 }}>
          {top10Cidades.map((c, idx) => {
            const pct = anoAtualData.totalAnual > 0 ? (c.total / anoAtualData.totalAnual) * 100 : 0
            return (
              <div key={c.cidade} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', background: '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: 8,
              }}>
                <span style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: idx < 3 ? '#fef3c7' : '#e2e8f0',
                  color: idx < 3 ? '#b45309' : '#64748b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, flexShrink: 0,
                }}>{idx + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.cidade}
                  </div>
                  <div style={{
                    height: 6, background: '#e2e8f0', borderRadius: 3,
                    overflow: 'hidden', marginTop: 4,
                  }}>
                    <div style={{
                      height: '100%', width: `${pct}%`,
                      background: idx < 3 ? '#f59e0b' : '#4AABDB',
                    }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#047857' }}>
                    {fmtReal(c.total)}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{pct.toFixed(1).replace('.', ',')}%</div>
                </div>
              </div>
            )
          })}
        </div>
      </Secao>

      {/* === Resumo Anual === */}
      <Secao titulo="📅 Resumo de Todos os Anos"
        sub="Visão consolidada de cada ano">
        <div style={{ display: 'grid', gap: 8 }}>
          {anos.slice().reverse().map((ano) => {
            const dadoAno = dados.porAno[ano]
            const anoAnt = anos[anos.indexOf(ano) - 1]
            const dadoAnoAnt = anoAnt ? dados.porAno[anoAnt] : null
            const cresc = dadoAnoAnt ? calcularCrescimento(dadoAnoAnt.totalAnual, dadoAno.totalAnual) : null
            return (
              <div key={ano} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '12px 16px',
                background: ano === anoAtual ? '#eff6ff' : '#f8fafc',
                border: `1px solid ${ano === anoAtual ? '#bfdbfe' : '#e2e8f0'}`,
                borderRadius: 8, gap: 12, flexWrap: 'wrap',
                cursor: 'pointer',
              }} onClick={() => setAnoSelecionado(ano)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b' }}>{ano}</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    {dadoAno.cidades.length} {dadoAno.cidades.length === 1 ? 'cidade' : 'cidades'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {cresc !== null && (
                    <span style={{
                      fontSize: 12, fontWeight: 600,
                      color: cresc >= 0 ? '#047857' : '#dc2626',
                      background: cresc >= 0 ? '#ecfdf5' : '#fef2f2',
                      padding: '3px 8px', borderRadius: 4,
                    }}>{fmtPct(cresc)}</span>
                  )}
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#047857' }}>
                    {fmtReal(dadoAno.totalAnual)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </Secao>

    </div>
  )
}

// ===== Estilos & componentes auxiliares =====

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

const KPI = ({ titulo, valor, sub, cor, icone }: {
  titulo: string; valor: string; sub: string; cor: string; icone: string
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
    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{sub}</div>
  </div>
)

const Secao = ({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) => (
  <div style={{
    background: '#fff', borderRadius: 12, padding: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    width: '100%', minWidth: 0, boxSizing: 'border-box',
  }}>
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{titulo}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
    {children}
  </div>
)

const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 10px', color: '#334155', whiteSpace: 'nowrap',
}
