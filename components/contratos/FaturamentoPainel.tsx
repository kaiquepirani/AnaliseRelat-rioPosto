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

// ============================================================
// PALETA DARK PREMIUM AZUL (espelha src/lib/theme.ts)
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
  muted2: '#475066',
  accent: '#4a9eff',
  accent2: '#6db3ff',
  accent3: '#2a7fd9',
  gold: '#d4b86a',
  red: '#f87171',
  amber: '#fbbf24',
  green: '#3ecf8e',
  violet: '#a78bfa',
  teal: '#14b8a6',
}

const fmtReal = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtRealK = (n: number) => {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(2).replace('.', ',')}M`
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}K`
  return fmtReal(n)
}
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1).replace('.', ',')}%`

const parseBRL = (s: string): number => {
  if (!s) return 0
  const clean = s.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(clean)
  return isNaN(n) ? 0 : n
}

// Paletas vibrantes adaptadas para fundo dark
const PALETA_CIDADES = [
  C.accent, C.gold, C.green, C.violet, C.teal, C.amber,
  '#22d3ee', '#fb7185', '#a3e635', '#ec4899', '#6366f1', '#14b8a6',
  '#facc15', '#f43f5e', '#8b5cf6', '#06b6d4', '#22c55e', '#f97316',
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

  const [modalManualAberto, setModalManualAberto] = useState(false)
  const [manualCidade, setManualCidade] = useState('')
  const [manualNovaCidade, setManualNovaCidade] = useState('')
  const [manualUsarNova, setManualUsarNova] = useState(false)
  const [manualAno, setManualAno] = useState<number>(new Date().getFullYear())
  const [manualMes, setManualMes] = useState<number>(new Date().getMonth())
  const [manualValor, setManualValor] = useState('')
  const [manualModo, setManualModo] = useState<'substituir' | 'somar'>('substituir')
  const [salvandoManual, setSalvandoManual] = useState(false)

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

  // Wrapper dark estendido
  const fundoFixo: React.CSSProperties = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: C.bg,
    backgroundImage: `
      radial-gradient(ellipse 800px 600px at 20% -10%, rgba(74,158,255,0.06), transparent 60%),
      radial-gradient(ellipse 600px 400px at 90% 110%, rgba(212,184,106,0.04), transparent 60%)
    `,
    pointerEvents: 'none',
    zIndex: 0,
  }
  const wrapperStyle: React.CSSProperties = {
    position: 'relative',
    zIndex: 1,
    color: C.ink,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    minHeight: 'calc(100vh - 200px)',
  }

  if (carregando) {
    return (
      <>
        <div style={fundoFixo} />
        <div style={wrapperStyle}>
          <div style={{
            padding: 60, textAlign: 'center', color: C.ink2,
            background: C.bgPanel, borderRadius: 12,
            border: `1px solid ${C.border}`,
          }}>
            Carregando dados de faturamento...
          </div>
        </div>
      </>
    )
  }

  if (!dados || dados.anos.length === 0) {
    return (
      <>
        <div style={fundoFixo} />
        <div style={wrapperStyle}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{
              padding: 60, textAlign: 'center', background: C.bgPanel,
              borderRadius: 12, border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>
                Nenhum faturamento cadastrado ainda
              </div>
              <div style={{ fontSize: 13, color: C.ink2, marginTop: 8, marginBottom: 20, lineHeight: 1.5 }}>
                Importe sua planilha de faturamento mensal para começar.<br />
                O Excel deve ter abas nomeadas como anos (2022, 2023, etc) com cidades nas linhas e meses nas colunas.
              </div>
              <input ref={inputFileRef} type="file"
                accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) importar(f) }} />
              <button onClick={() => inputFileRef.current?.click()} disabled={importando} style={{
                padding: '12px 24px',
                background: importando
                  ? C.bgPanel3
                  : `linear-gradient(135deg, ${C.violet} 0%, #7c3aed 100%)`,
                color: importando ? C.muted : '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: importando ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                boxShadow: importando ? 'none' : `0 4px 12px ${C.violet}40`,
              }}>
                {importando ? '⏳ Importando...' : '📤 Importar Planilha Excel'}
              </button>
            </div>
          </div>
        </div>
      </>
    )
  }

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

  const todasCidadesSet = new Set<string>()
  for (const ano of anos) {
    for (const c of dados.porAno[ano].cidades) todasCidadesSet.add(c.cidade)
  }
  const todasCidadesGlobal = Array.from(todasCidadesSet).sort()

  const anosManual = (() => {
    const set = new Set<number>(anos)
    const atual = new Date().getFullYear()
    set.add(atual)
    set.add(atual + 1)
    return Array.from(set).sort((a, b) => a - b)
  })()

  const cidadesDoAno = anoAtualData.cidades

  let cidadesParaGrafico: string[] = []
  if (modoFiltro === 'todos') {
    cidadesParaGrafico = cidadesDoAno.map(c => c.cidade)
  } else if (modoFiltro === 'top10') {
    cidadesParaGrafico = top10Cidades.map(c => c.cidade)
  } else {
    cidadesParaGrafico = cidadesDoAno
      .filter(c => cidadesAtivas.has(c.cidade))
      .map(c => c.cidade)
  }

  const dadosEmpilhado = NOMES_MESES.map((mes, i) => {
    const obj: any = { mes }
    if (modoFiltro === 'todos') {
      obj['__total__'] = anoAtualData.totalPorMes[i] || 0
    } else {
      let total = 0
      for (const cidade of cidadesParaGrafico) {
        const cid = anoAtualData.cidades.find(c => c.cidade === cidade)
        const v = cid?.meses[i] ?? 0
        obj[cidade] = v
        total += v
      }
      obj['__total__'] = total
    }
    return obj
  })

  const toggleCidade = (cidade: string) => {
    const novo = new Set(cidadesAtivas)
    if (novo.has(cidade)) novo.delete(cidade)
    else novo.add(cidade)
    setCidadesAtivas(novo)
    setModoFiltro('custom')
  }

  const abrirModalManual = () => {
    setManualAno(anoAtual)
    setManualMes(new Date().getMonth())
    setManualCidade(todasCidadesGlobal[0] || '')
    setManualNovaCidade('')
    setManualUsarNova(false)
    setManualValor('')
    setManualModo('substituir')
    setModalManualAberto(true)
  }

  const cidadeAlvoManual = manualUsarNova ? manualNovaCidade.trim() : manualCidade
  const valorExistenteManual = (() => {
    if (!cidadeAlvoManual) return null
    const dataAno = dados.porAno[manualAno]
    if (!dataAno) return null
    const cid = dataAno.cidades.find(c => c.cidade === cidadeAlvoManual)
    if (!cid) return null
    return cid.meses[manualMes]
  })()

  const salvarManual = async () => {
    const cidadeAlvo = manualUsarNova ? manualNovaCidade.trim() : manualCidade
    if (!cidadeAlvo) {
      alert('Selecione ou cadastre uma cidade/contrato')
      return
    }
    if (manualValor.trim() === '') {
      alert('Informe o valor do faturamento')
      return
    }
    const valorNum = parseBRL(manualValor)
    if (valorNum < 0) {
      alert('Valor não pode ser negativo')
      return
    }

    setSalvandoManual(true)
    try {
      const existing = dados?.porAno[manualAno]?.cidades.find(c => c.cidade === cidadeAlvo)
      const baseMeses: (number | null)[] = existing
        ? existing.meses.slice()
        : new Array(12).fill(null)

      const valorAtual = baseMeses[manualMes]
      let novoValor: number
      if (manualModo === 'somar' && typeof valorAtual === 'number') {
        novoValor = valorAtual + valorNum
      } else {
        novoValor = valorNum
      }
      baseMeses[manualMes] = novoValor

      const r = await fetch('/api/faturamento', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ano: manualAno,
          cidade: cidadeAlvo,
          meses: baseMeses,
        }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        alert(d.erro || `Erro ${r.status} ao salvar`)
        return
      }

      alert(`✅ Lançamento salvo\n\n${cidadeAlvo}\n${NOMES_MESES[manualMes]}/${manualAno}: ${fmtReal(novoValor)}`)
      setModalManualAberto(false)
      setAnoSelecionado(manualAno)
      await carregar()
    } catch (err: any) {
      alert(`Erro: ${err?.message || 'desconhecido'}`)
    } finally {
      setSalvandoManual(false)
    }
  }

  return (
    <>
      <div style={fundoFixo} />
      <div style={wrapperStyle}>
        <div style={{ display: 'grid', gap: 16, width: '100%', minWidth: 0 }}>

          {/* === Cabeçalho === */}
          <div style={{
            background: C.bgPanel, padding: 14, borderRadius: 12,
            border: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            flexWrap: 'wrap', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 13, color: C.ink2, fontWeight: 600 }}>Ano:</label>
              <select value={anoAtual} onChange={e => setAnoSelecionado(Number(e.target.value))}
                style={{
                  padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 8,
                  fontSize: 14, background: C.bgPanel2, color: C.ink, fontFamily: 'inherit',
                  outline: 'none', cursor: 'pointer', fontWeight: 600,
                }}>
                {anos.slice().reverse().map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              {dados.ultimaAtualizacao && (
                <span style={{ fontSize: 11, color: C.muted }}>
                  Última atualização: {new Date(dados.ultimaAtualizacao).toLocaleDateString('pt-BR')}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={abrirModalManual} style={{
                padding: '8px 16px',
                background: `linear-gradient(135deg, ${C.green} 0%, #10b981 100%)`,
                color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: `0 4px 12px ${C.green}30`,
              }}>
                ➕ Lançamento manual
              </button>
              <input ref={inputFileRef} type="file"
                accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) importar(f) }} />
              <button onClick={() => inputFileRef.current?.click()} disabled={importando} style={{
                padding: '8px 16px',
                background: importando
                  ? C.bgPanel3
                  : `linear-gradient(135deg, ${C.violet} 0%, #7c3aed 100%)`,
                color: importando ? C.muted : '#fff',
                border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: importando ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                boxShadow: importando ? 'none' : `0 4px 12px ${C.violet}40`,
              }}>
                {importando ? '⏳ Importando...' : '📤 Atualizar planilha'}
              </button>
            </div>
          </div>

          {/* === KPIs === */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
          }}>
            <KPI titulo={`Total ${anoAtual}`} valor={fmtReal(anoAtualData.totalAnual)}
              sub={ultimoMesComDado >= 0 ? `até ${NOMES_MESES[ultimoMesComDado]}` : ''}
              cor={C.green} icone="💰" highlight />
            <KPI titulo={ultimoMesComDado >= 0 ? `${NOMES_MESES[ultimoMesComDado]}/${String(anoAtual).slice(2)}` : 'Sem dados'}
              valor={ultimoMesComDado >= 0 ? fmtReal(anoAtualData.totalPorMes[ultimoMesComDado]) : '—'}
              sub="último mês com dados" cor={C.accent} icone="📅" />
            {anoAnterior && (
              <KPI titulo={`vs ${anoAnterior}`}
                valor={fmtPct(crescimentoAnoAno)}
                sub="mesmo período"
                cor={crescimentoAnoAno >= 0 ? C.green : C.red}
                icone={crescimentoAnoAno >= 0 ? '📈' : '📉'} />
            )}
            <KPI titulo="Cidades/Contratos" valor={String(anoAtualData.cidades.length)}
              sub={`em ${anoAtual}`} cor={C.accent2} icone="🏙️" />
          </div>

          {/* === Gráfico: Barras empilhadas === */}
          <Secao titulo={`📊 Evolução Mensal por Contrato — ${anoAtual}`}
            sub='Selecione um contrato para ver isolado, ou "Todos" para ver o total geral'>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              <button onClick={() => { setModoFiltro('todos'); setCidadesAtivas(new Set()) }}
                style={chipStyle(modoFiltro === 'todos', C.accent)}>
                Todos
              </button>
              <button onClick={() => { setModoFiltro('top10'); setCidadesAtivas(new Set()) }}
                style={chipStyle(modoFiltro === 'top10', C.gold)}>
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

            <div style={{ width: '100%', height: 380 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosEmpilhado} margin={{ top: 24, right: 20, left: 10, bottom: 10 }}>
                  <defs>
                    <linearGradient id="evolucaoBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.accent2} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={C.accent3} stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: C.ink2 }} stroke={C.borderStrong} />
                  <YAxis tickFormatter={fmtRealK} tick={{ fontSize: 11, fill: C.ink2 }}
                    stroke={C.borderStrong} width={70} />
                  <Tooltip
                    formatter={(v: any, name: any) => [fmtReal(Number(v)), name === '__total__' ? 'Total' : name]}
                    contentStyle={{
                      borderRadius: 8, fontSize: 12, maxWidth: 320,
                      background: C.bgPanel3, border: `1px solid ${C.borderStrong}`,
                      color: C.ink,
                    }}
                    labelStyle={{ fontWeight: 600, color: C.ink }}
                    itemSorter={(item: any) => -Number(item.value)}
                    cursor={{ fill: `${C.accent}15` }}
                  />
                  {modoFiltro === 'todos' ? (
                    <Bar dataKey="__total__" fill="url(#evolucaoBar)" radius={[6, 6, 0, 0]} name="Total">
                      <LabelList dataKey="__total__" position="top" formatter={fmtRealK}
                        style={{ fontSize: 10, fill: C.ink, fontWeight: 600 }} />
                    </Bar>
                  ) : (
                    cidadesParaGrafico.map((cidade, idx) => (
                      <Bar key={cidade} dataKey={cidade} stackId="a"
                        fill={corCidade(cidade, todasCidadesGlobal)}
                        name={cidade}>
                        {idx === cidadesParaGrafico.length - 1 && (
                          <LabelList dataKey="__total__" position="top"
                            formatter={(v: any) => Number(v) > 0 ? fmtRealK(Number(v)) : ''}
                            style={{ fontSize: 10, fill: C.ink, fontWeight: 600 }} />
                        )}
                      </Bar>
                    ))
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>

            {modoFiltro !== 'todos' && cidadesParaGrafico.length > 0 && (
              <div style={{
                marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8,
                paddingTop: 12, borderTop: `1px solid ${C.border}`,
              }}>
                {cidadesParaGrafico.map(cidade => (
                  <div key={cidade} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 11, color: C.ink2,
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
                color: C.muted, fontSize: 12,
                background: C.bgPanel2, borderRadius: 6,
                border: `1px dashed ${C.border}`,
              }}>
                Nenhum contrato selecionado. Clique nos chips acima para escolher quais visualizar.
              </div>
            )}
          </Secao>

          {/* === Gráfico: Barras simples === */}
          <Secao titulo={`📊 Faturamento Mensal ${anoAtual}`}
            sub="Detalhamento mês a mês do ano selecionado">
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosBarrasMes} margin={{ top: 20, right: 20, left: 10, bottom: 10 }}>
                  <defs>
                    <linearGradient id="mensalBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.gold} stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#a8924d" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: C.ink2 }} stroke={C.borderStrong} />
                  <YAxis tickFormatter={fmtRealK} tick={{ fontSize: 11, fill: C.ink2 }}
                    stroke={C.borderStrong} width={70} />
                  <Tooltip formatter={(v: any) => fmtReal(Number(v))}
                    contentStyle={{
                      borderRadius: 8, fontSize: 12,
                      background: C.bgPanel3, border: `1px solid ${C.borderStrong}`,
                      color: C.ink,
                    }}
                    cursor={{ fill: `${C.gold}15` }} />
                  <Bar dataKey="valor" fill="url(#mensalBar)" radius={[6, 6, 0, 0]}>
                    <LabelList dataKey="valor" position="top" formatter={fmtRealK}
                      style={{ fontSize: 10, fill: C.ink, fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Secao>

          {/* === Tabela === */}
          <Secao titulo={`🏙️ Detalhamento por Cidade — ${anoAtual}`}
            sub={`${anoAtualData.cidades.length} contratos`}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
                <thead>
                  <tr style={{
                    background: C.bgPanel2, color: C.muted,
                    fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3,
                  }}>
                    <th style={{ ...thStyle, position: 'sticky', left: 0, background: C.bgPanel2, zIndex: 1 }}>Cidade</th>
                    {NOMES_MESES.map(m => (
                      <th key={m} style={{ ...thStyle, textAlign: 'right' }}>{m}</th>
                    ))}
                    <th style={{
                      ...thStyle, textAlign: 'right',
                      background: `${C.accent}25`, color: C.accent2,
                    }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {anoAtualData.cidades.map(c => (
                    <tr key={c.cidade} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{
                        ...tdStyle, fontWeight: 600, color: C.ink,
                        position: 'sticky', left: 0, background: C.bgPanel, zIndex: 1,
                      }}>{c.cidade}</td>
                      {c.meses.map((v, i) => (
                        <td key={i} style={{
                          ...tdStyle, textAlign: 'right',
                          color: v == null ? C.muted2 : C.ink2,
                          fontFamily: 'monospace',
                        }}>
                          {v == null ? '—' : fmtRealK(v)}
                        </td>
                      ))}
                      <td style={{
                        ...tdStyle, textAlign: 'right', fontWeight: 700,
                        color: C.green, background: `${C.green}10`,
                        fontFamily: 'monospace',
                      }}>
                        {fmtReal(c.total)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: `${C.green}15`, borderTop: `2px solid ${C.green}40` }}>
                    <td style={{
                      ...tdStyle, fontWeight: 700, color: C.green,
                      position: 'sticky', left: 0, background: `${C.green}15`,
                    }}>TOTAL</td>
                    {anoAtualData.totalPorMes.map((v, i) => (
                      <td key={i} style={{
                        ...tdStyle, textAlign: 'right', fontWeight: 700,
                        color: C.green, fontFamily: 'monospace',
                      }}>
                        {fmtRealK(v)}
                      </td>
                    ))}
                    <td style={{
                      ...tdStyle, textAlign: 'right', fontWeight: 700,
                      color: C.green, fontFamily: 'monospace',
                    }}>
                      {fmtReal(anoAtualData.totalAnual)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Secao>

          {/* === Top 10 === */}
          <Secao titulo={`🏆 Top 10 Maiores Faturamentos — ${anoAtual}`}
            sub="Cidades/contratos com maior receita no ano">
            <div style={{ display: 'grid', gap: 8 }}>
              {top10Cidades.map((c, idx) => {
                const pct = anoAtualData.totalAnual > 0 ? (c.total / anoAtualData.totalAnual) * 100 : 0
                const isTop3 = idx < 3
                return (
                  <div key={c.cidade} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', background: C.bgPanel2,
                    border: `1px solid ${C.border}`, borderRadius: 8,
                    transition: 'all 0.15s',
                  }}>
                    <span style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: isTop3
                        ? `linear-gradient(135deg, ${C.gold} 0%, #a8924d 100%)`
                        : C.bgPanel3,
                      color: isTop3 ? '#0a0f1f' : C.ink2,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, flexShrink: 0,
                      border: `1px solid ${isTop3 ? C.gold : C.border}`,
                      boxShadow: isTop3 ? `0 2px 8px ${C.gold}40` : 'none',
                    }}>{idx + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 600, color: C.ink,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {c.cidade}
                      </div>
                      <div style={{
                        height: 6, background: C.bgPanel3, borderRadius: 3,
                        overflow: 'hidden', marginTop: 5,
                        border: `1px solid ${C.border}`,
                      }}>
                        <div style={{
                          height: '100%', width: `${pct}%`,
                          background: isTop3 ? C.gold : C.accent,
                          boxShadow: `0 0 6px ${isTop3 ? C.gold : C.accent}80`,
                        }} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: 700, color: C.green,
                        fontFamily: 'monospace',
                      }}>
                        {fmtReal(c.total)}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted }}>{pct.toFixed(1).replace('.', ',')}%</div>
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
                const ativo = ano === anoAtual
                return (
                  <div key={ano} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 16px',
                    background: ativo
                      ? `linear-gradient(135deg, ${C.bgPanel2} 0%, ${C.bgPanel} 100%)`
                      : C.bgPanel2,
                    border: `1px solid ${ativo ? C.accent : C.border}`,
                    borderRadius: 8, gap: 12, flexWrap: 'wrap',
                    cursor: 'pointer',
                    boxShadow: ativo ? `0 2px 12px ${C.accent}25` : 'none',
                    transition: 'all 0.15s',
                  }} onClick={() => setAnoSelecionado(ano)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{
                        fontSize: 18, fontWeight: 700,
                        color: ativo ? C.accent2 : C.ink,
                        fontFamily: 'monospace',
                      }}>{ano}</span>
                      <span style={{ fontSize: 12, color: C.ink2 }}>
                        {dadoAno.cidades.length} {dadoAno.cidades.length === 1 ? 'cidade' : 'cidades'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      {cresc !== null && (
                        <span style={{
                          fontSize: 12, fontWeight: 600,
                          color: cresc >= 0 ? C.green : C.red,
                          background: cresc >= 0 ? `${C.green}15` : `${C.red}15`,
                          border: `1px solid ${cresc >= 0 ? C.green : C.red}40`,
                          padding: '3px 10px', borderRadius: 4,
                        }}>{fmtPct(cresc)}</span>
                      )}
                      <span style={{
                        fontSize: 16, fontWeight: 700, color: C.green,
                        fontFamily: 'monospace',
                      }}>
                        {fmtReal(dadoAno.totalAnual)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </Secao>

          {/* === MODAL Lançamento Manual === */}
          {modalManualAberto && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.75)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 9999, padding: 16, backdropFilter: 'blur(4px)',
            }} onClick={() => !salvandoManual && setModalManualAberto(false)}>
              <div onClick={e => e.stopPropagation()} style={{
                background: C.bgPanel, borderRadius: 12, padding: 24,
                width: '100%', maxWidth: 500, maxHeight: '92vh', overflowY: 'auto',
                border: `1px solid ${C.borderStrong}`,
                boxShadow: `0 20px 80px rgba(0,0,0,0.5), 0 0 0 1px ${C.accent}30`,
                color: C.ink,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.ink }}>
                      ➕ Lançamento Manual
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                      Adicione um faturamento sem precisar reimportar a planilha
                    </div>
                  </div>
                  <button onClick={() => setModalManualAberto(false)} disabled={salvandoManual} style={{
                    background: 'transparent', border: 'none', fontSize: 22, color: C.ink2,
                    cursor: salvandoManual ? 'not-allowed' : 'pointer', padding: 0, lineHeight: 1,
                  }}>×</button>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Cidade / Contrato</label>
                  {!manualUsarNova ? (
                    <select value={manualCidade} onChange={e => setManualCidade(e.target.value)}
                      style={inputStyle}>
                      <option value="">— Selecione —</option>
                      {todasCidadesGlobal.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  ) : (
                    <input type="text" value={manualNovaCidade}
                      onChange={e => setManualNovaCidade(e.target.value.toUpperCase())}
                      placeholder="Ex: NOVO CONTRATO XYZ"
                      style={inputStyle} />
                  )}
                  <label style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontSize: 11, color: C.ink2, marginTop: 8, cursor: 'pointer',
                  }}>
                    <input type="checkbox" checked={manualUsarNova}
                      onChange={e => setManualUsarNova(e.target.checked)} />
                    🆕 Cadastrar nova cidade/contrato
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  <div>
                    <label style={labelStyle}>Ano</label>
                    <select value={manualAno} onChange={e => setManualAno(Number(e.target.value))}
                      style={inputStyle}>
                      {anosManual.map(a => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Mês</label>
                    <select value={manualMes} onChange={e => setManualMes(Number(e.target.value))}
                      style={inputStyle}>
                      {NOMES_MESES.map((m, i) => (
                        <option key={m} value={i}>{m}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {valorExistenteManual !== null && valorExistenteManual !== undefined && (
                  <div style={{
                    background: `${C.amber}10`, border: `1px solid ${C.amber}40`,
                    borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 12,
                  }}>
                    <div style={{ color: C.amber, fontWeight: 600, marginBottom: 4 }}>
                      ⚠️ Já existe um valor para {NOMES_MESES[manualMes]}/{manualAno}
                    </div>
                    <div style={{ color: C.ink2 }}>
                      Valor atual: <strong style={{ color: C.ink, fontFamily: 'monospace' }}>{fmtReal(valorExistenteManual)}</strong>
                    </div>
                    <div style={{ marginTop: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: C.ink2 }}>
                        <input type="radio" name="modo" checked={manualModo === 'substituir'}
                          onChange={() => setManualModo('substituir')} />
                        Substituir o valor
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', color: C.ink2 }}>
                        <input type="radio" name="modo" checked={manualModo === 'somar'}
                          onChange={() => setManualModo('somar')} />
                        Somar ao valor atual
                      </label>
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Valor (R$)</label>
                  <input type="text" value={manualValor}
                    onChange={e => setManualValor(e.target.value)}
                    placeholder="Ex: 15000 ou 15.000,50"
                    style={{
                      ...inputStyle,
                      fontFamily: 'monospace', fontSize: 16, fontWeight: 600,
                    }}
                    autoFocus />
                  {manualValor && (
                    <div style={{ fontSize: 11, color: C.ink2, marginTop: 6 }}>
                      Será gravado: <strong style={{ color: C.green, fontFamily: 'monospace' }}>{fmtReal(parseBRL(manualValor))}</strong>
                      {manualModo === 'somar' && typeof valorExistenteManual === 'number' && valorExistenteManual > 0 && (
                        <> → Total final: <strong style={{ color: C.green, fontFamily: 'monospace' }}>{fmtReal(valorExistenteManual + parseBRL(manualValor))}</strong></>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setModalManualAberto(false)} disabled={salvandoManual} style={{
                    padding: '10px 18px', background: C.bgPanel3, color: C.ink2,
                    border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13,
                    fontWeight: 600, cursor: salvandoManual ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  }}>
                    Cancelar
                  </button>
                  <button onClick={salvarManual} disabled={salvandoManual} style={{
                    padding: '10px 20px',
                    background: salvandoManual
                      ? C.bgPanel3
                      : `linear-gradient(135deg, ${C.green} 0%, #10b981 100%)`,
                    color: salvandoManual ? C.muted : '#fff',
                    border: 'none', borderRadius: 8, fontSize: 13,
                    fontWeight: 600, cursor: salvandoManual ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                    boxShadow: salvandoManual ? 'none' : `0 4px 12px ${C.green}40`,
                  }}>
                    {salvandoManual ? '⏳ Salvando...' : '✅ Salvar lançamento'}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}

// ====================================================================
// Componentes auxiliares
// ====================================================================

const chipStyle = (ativo: boolean, cor: string): React.CSSProperties => ({
  padding: '5px 12px',
  background: ativo ? cor : C.bgPanel2,
  color: ativo ? '#0a0f1f' : C.ink2,
  border: `1px solid ${ativo ? cor : C.border}`,
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  transition: 'all 0.15s',
  boxShadow: ativo ? `0 2px 8px ${cor}40` : 'none',
})

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600,
  color: C.ink2, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: `1px solid ${C.border}`,
  borderRadius: 8, fontSize: 13, background: C.bgPanel2, color: C.ink,
  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}

const KPI = ({ titulo, valor, sub, cor, icone, highlight }: {
  titulo: string; valor: string; sub: string; cor: string; icone: string; highlight?: boolean
}) => (
  <div style={{
    background: highlight
      ? `linear-gradient(135deg, ${C.bgPanel2} 0%, ${C.bgPanel} 100%)`
      : C.bgPanel,
    padding: 18, borderRadius: 12,
    border: `1px solid ${C.border}`,
    borderTop: `2px solid ${cor}`,
    minWidth: 0,
    position: 'relative',
    overflow: 'hidden',
    boxShadow: highlight ? `0 4px 20px ${cor}20` : 'none',
  }}>
    {highlight && (
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${cor}80 50%, transparent)`,
      }} />
    )}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{
        fontSize: 10, color: C.muted, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: 0.5,
      }}>
        {titulo}
      </div>
      <span style={{ fontSize: 20 }}>{icone}</span>
    </div>
    <div style={{
      fontSize: 24, fontWeight: 700, color: cor,
      marginTop: 8, wordBreak: 'break-word',
      fontFamily: 'monospace', letterSpacing: '-0.025em',
    }}>{valor}</div>
    <div style={{ fontSize: 11, color: C.ink2, marginTop: 6 }}>{sub}</div>
  </div>
)

const Secao = ({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) => (
  <div style={{
    background: C.bgPanel, borderRadius: 12, padding: 18,
    border: `1px solid ${C.border}`,
    width: '100%', minWidth: 0, boxSizing: 'border-box',
  }}>
    <div style={{
      marginBottom: 16, paddingBottom: 12,
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{titulo}</div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
    {children}
  </div>
)

const thStyle: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '9px 12px', color: C.ink2, whiteSpace: 'nowrap',
}
