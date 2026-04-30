'use client'
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import {
  BarChart, Bar, ComposedChart, ResponsiveContainer,
  Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell, PieChart, Pie,
} from 'recharts'
import type { Financiamento, TipoBem, PlanoOrigem } from '@/lib/financiamentos-types'
import {
  TIPOS_BEM, PLANOS_ORIGEM, CENTROS_CUSTO, CORES_TIPO,
  calcParcelasPagasAteHoje, calcRestantes, calcSaldoDevedor,
  calcQuitacao, calcProgressoPct, calcProximoVencReal,
} from '@/lib/financiamentos-types'

interface Props {
  token: string
  onLogout: () => void
}

// ============================================================
// PALETA DARK PREMIUM AZUL
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
  goldSoft: '#a8924d',
  red: '#f87171',
  amber: '#fbbf24',
  green: '#3ecf8e',
  violet: '#a78bfa',
  teal: '#14b8a6',
}

const fmtReal = (n: number) =>
  (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtShort = (n: number) => {
  if (Math.abs(n) >= 1e6) return `R$ ${(n / 1e6).toFixed(2)} M`
  if (Math.abs(n) >= 1e3) return `R$ ${(n / 1e3).toFixed(0)} k`
  return `R$ ${(n || 0).toFixed(0)}`
}
const fmtMonth = (s: string | null) => {
  if (!s) return '–'
  const [y, m] = s.split('-')
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${meses[parseInt(m) - 1]}/${y.slice(2)}`
}

const TIPO_COLORS_DARK: Record<string, string> = {
  'Ônibus': '#d4b86a',
  'Micro-ônibus': '#fbd38d',
  'Van': '#a78bfa',
  'Veículo': '#14b8a6',
  'Imóvel/Terreno': '#fb7185',
  'Carro Administrativo': '#4a9eff',
  'Empréstimo': '#fbbf24',
  'Consignado Funcionário': '#94a3b8',
  'Compra de Veículos': '#3ecf8e',
  'Equipamento Veicular': '#22d3ee',
  'Outros': '#6b7896',
}

type Vista = 'dashboard' | 'lista'

// ============================================================
// Tipo da frota (espelha src/lib/frota.ts)
// ============================================================
interface FrotaVeiculo {
  nFrota: string
  placa: string
  grupo: string
  marca: string
  modelo: string
}

// Helpers de veículos: o campo prefixo agora aceita múltiplos
// veículos separados por ";" (ex: "4832 (ETC1044); 4844 (ETC0J91)")
function parseVeiculos(prefixo: string): string[] {
  if (!prefixo) return []
  // Aceita ; , ou \n como separadores
  return prefixo
    .split(/[;\n]/)
    .map(s => s.trim())
    .filter(Boolean)
}

function joinVeiculos(veiculos: string[]): string {
  return veiculos.map(v => v.trim()).filter(Boolean).join('; ')
}

export default function FinanciamentosPainel({ token, onLogout }: Props) {
  const [vista, setVista] = useState<Vista>('dashboard')
  const [lista, setLista] = useState<Financiamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroPlano, setFiltroPlano] = useState<string>('')
  const [filtroCredor, setFiltroCredor] = useState<string>('')
  const [filtroTipo, setFiltroTipo] = useState<string>('')
  const [filtroCC, setFiltroCC] = useState<string>('')
  const [modalAberto, setModalAberto] = useState(false)
  const [emEdicao, setEmEdicao] = useState<Financiamento | null>(null)

  // Frota cadastrada (para autocomplete)
  const [frota, setFrota] = useState<FrotaVeiculo[]>([])

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await fetch('/api/financiamentos', { headers })
      if (r.status === 401) { onLogout(); return }
      const data = await r.json()
      setLista(Array.isArray(data) ? data : [])
    } finally {
      setCarregando(false)
    }
  }, [headers, onLogout])

  // Carrega a frota uma vez (autocomplete)
  const carregarFrota = useCallback(async () => {
    try {
      const r = await fetch('/api/frota')
      if (r.ok) {
        const data = await r.json()
        if (Array.isArray(data)) setFrota(data)
      }
    } catch {
      // se não conseguir, segue sem autocomplete
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { carregarFrota() }, [carregarFrota])

  // Histórico de veículos já cadastrados em outros financiamentos
  const historicoVeiculos = useMemo(() => {
    const set = new Set<string>()
    lista.forEach(f => {
      parseVeiculos(f.prefixo || '').forEach(v => set.add(v))
    })
    return Array.from(set).sort()
  }, [lista])

  // ============ Cálculos agregados ============
  const agregados = useMemo(() => {
    let totalSaldo = 0
    let totalMensal = 0
    const credores: Record<string, { qtd: number; mensal: number; saldo: number }> = {}
    const tipos: Record<string, { qtd: number; saldo: number }> = {}

    lista.forEach(f => {
      const saldo = calcSaldoDevedor(f)
      totalSaldo += saldo
      if (!f.semInfo && f.frequencia === 'mensal') totalMensal += f.valorParcela

      if (!credores[f.fornecedor]) credores[f.fornecedor] = { qtd: 0, mensal: 0, saldo: 0 }
      credores[f.fornecedor].qtd++
      credores[f.fornecedor].mensal += f.valorParcela
      credores[f.fornecedor].saldo += saldo

      if (!tipos[f.tipo]) tipos[f.tipo] = { qtd: 0, saldo: 0 }
      tipos[f.tipo].qtd++
      tipos[f.tipo].saldo += saldo
    })

    return {
      totalSaldo,
      totalMensal,
      credores: Object.entries(credores)
        .map(([k, v]) => ({ banco: k, ...v }))
        .sort((a, b) => b.saldo - a.saldo),
      tipos: Object.entries(tipos)
        .map(([k, v]) => ({ tipo: k, ...v }))
        .sort((a, b) => b.saldo - a.saldo),
    }
  }, [lista])

  const cronograma = useMemo(() => {
    const out: Record<string, number> = {}

    lista.forEach(f => {
      if (f.semInfo) return
      const restantes = calcRestantes(f)
      if (restantes === 0) return
      if (f.frequencia === 'unico') return

      const proximo = calcProximoVencReal(f)
      if (!proximo) return

      const parts = proximo.split('-')
      const sy = parseInt(parts[0])
      const sm = parseInt(parts[1])

      if (f.frequencia === 'semanal') {
        const start = new Date(proximo + 'T12:00:00')
        for (let i = 0; i < restantes; i++) {
          const dt = new Date(start)
          dt.setDate(dt.getDate() + 7 * i)
          const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
          out[key] = (out[key] || 0) + f.valorParcela
        }
      } else {
        for (let i = 0; i < restantes; i++) {
          const tot = (sm - 1) + i
          const y = sy + Math.floor(tot / 12)
          const m = (tot % 12) + 1
          const key = `${y}-${String(m).padStart(2, '0')}`
          out[key] = (out[key] || 0) + f.valorParcela
        }
      }
    })

    const meses = Object.keys(out).sort().slice(0, 60)
    return meses.map(m => ({
      mes: fmtMonth(m),
      compromisso: Math.round(out[m]),
    }))
  }, [lista])

  const cronogramaComSaldo = useMemo(() => {
    let saldoAcum = cronograma.reduce((s, c) => s + c.compromisso, 0)
    return cronograma.map((c, i) => {
      if (i > 0) saldoAcum -= cronograma[i - 1].compromisso
      return { ...c, saldo: Math.round(saldoAcum) }
    })
  }, [cronograma])

  // ============ Lista filtrada ============
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return [...lista]
      .sort((a, b) => calcSaldoDevedor(b) - calcSaldoDevedor(a))
      .filter(f =>
        (!filtroPlano || f.planoOrigem === filtroPlano) &&
        (!filtroCredor || f.fornecedor === filtroCredor) &&
        (!filtroTipo || f.tipo === filtroTipo) &&
        (!filtroCC || f.cc === filtroCC) &&
        (!termo || (f.descricao + ' ' + f.fornecedor + ' ' + (f.prefixo || '') + ' ' + f.tipo).toLowerCase().includes(termo)),
      )
  }, [lista, busca, filtroPlano, filtroCredor, filtroTipo, filtroCC])

  const credoresLista = useMemo(
    () => Array.from(new Set(lista.map(f => f.fornecedor))).sort(),
    [lista],
  )

  // ============ Handlers ============
  const abrirNovo = () => { setEmEdicao(null); setModalAberto(true) }
  const abrirEdicao = (f: Financiamento) => { setEmEdicao(f); setModalAberto(true) }

  const salvar = async (dados: Partial<Financiamento>) => {
    const url = emEdicao ? `/api/financiamentos/${emEdicao.id}` : '/api/financiamentos'
    const method = emEdicao ? 'PUT' : 'POST'
    const r = await fetch(url, {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      alert(d.erro || 'Erro ao salvar')
      return
    }
    setModalAberto(false)
    setEmEdicao(null)
    await carregar()
  }

  const excluir = async (f: Financiamento) => {
    if (!confirm(`Excluir o financiamento "${f.descricao}"?`)) return
    const r = await fetch(`/api/financiamentos/${f.id}`, { method: 'DELETE', headers })
    if (!r.ok) { alert('Erro ao excluir'); return }
    await carregar()
  }

  const pagarParcela = async (f: Financiamento) => {
    const r = await fetch(`/api/financiamentos/${f.id}`, { method: 'POST', headers })
    if (!r.ok) {
      const d = await r.json().catch(() => ({}))
      alert(d.erro || 'Erro ao avançar parcela')
      return
    }
    await carregar()
  }

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
            background: C.bgPanel, borderRadius: 12, border: `1px solid ${C.border}`,
          }}>
            Carregando financiamentos...
          </div>
        </div>
      </>
    )
  }

  const proxMes = cronograma[0]?.compromisso || 0
  const proxMesNome = cronograma[0]?.mes || '–'
  const maiorContrato = [...lista].sort((a, b) => calcSaldoDevedor(b) - calcSaldoDevedor(a))[0]
  const novosCount = lista.filter(f => f.novoContrato).length

  return (
    <>
      <div style={fundoFixo} />
      <div style={wrapperStyle}>
        <div style={{
          display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <div style={{
            display: 'inline-flex', background: C.bgPanel, borderRadius: 10,
            padding: 4, border: `1px solid ${C.border}`,
          }}>
            <button onClick={() => setVista('dashboard')} style={toggleBtn(vista === 'dashboard')}>
              📊 Dashboard
            </button>
            <button onClick={() => setVista('lista')} style={toggleBtn(vista === 'lista')}>
              📋 Lista de contratos
            </button>
          </div>
          <button onClick={abrirNovo} style={{
            marginLeft: 'auto',
            padding: '10px 18px',
            background: `linear-gradient(135deg, ${C.accent} 0%, ${C.accent3} 100%)`,
            color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: `0 4px 12px ${C.accent}40`,
          }}>+ Novo Financiamento</button>
        </div>

        {vista === 'dashboard' ? (
          <>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 14, marginBottom: 22,
            }}>
              <KPI titulo="Saldo Devedor" valor={fmtShort(agregados.totalSaldo)} cor={C.red}
                sub={`${lista.length} contratos`} />
              <KPI titulo="Compromisso Mensal" valor={fmtShort(agregados.totalMensal)} cor={C.gold}
                sub="parcelas regulares" highlight />
              <KPI titulo={`Próximo: ${proxMesNome}`} valor={fmtShort(proxMes)} cor={C.accent}
                sub="compromisso já contratado" />
              <KPI titulo="Maior Credor"
                valor={fmtShort(agregados.credores[0]?.saldo || 0)} cor={C.violet}
                sub={`${(agregados.credores[0]?.banco || '–').substring(0, 18)} (${agregados.credores[0]?.qtd || 0})`} />
              <KPI titulo="Maior Contrato"
                valor={fmtShort(maiorContrato ? calcSaldoDevedor(maiorContrato) : 0)} cor={C.amber}
                sub={maiorContrato?.descricao.substring(0, 22) || '–'} />
              <KPI titulo="Novos Contratos" valor={String(novosCount)} cor={C.green}
                sub="marcados como novos" />
            </div>

            <div style={{ ...cardStyle, marginBottom: 16 }}>
              <div style={cardHeader}>
                <div style={cardTitle}>📅 Cronograma de Compromisso Mensal</div>
                <div style={cardSub}>Barras = compromisso · Linha = saldo devedor decrescente</div>
              </div>
              <div style={{ height: 380 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={cronogramaComSaldo}>
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.accent2} stopOpacity={0.95} />
                        <stop offset="100%" stopColor={C.accent3} stopOpacity={0.7} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="mes" tick={{ fontSize: 10, fill: C.ink2 }} stroke={C.borderStrong} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: C.ink2 }}
                      stroke={C.borderStrong}
                      tickFormatter={(v: number) => fmtShort(v)} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: C.gold }}
                      stroke={C.borderStrong}
                      tickFormatter={(v: number) => fmtShort(v)} />
                    <Tooltip
                      formatter={(v: any) => fmtReal(v)}
                      contentStyle={{
                        background: C.bgPanel3, border: `1px solid ${C.borderStrong}`,
                        borderRadius: 8, color: C.ink, fontSize: 12,
                      }}
                      labelStyle={{ color: C.ink, fontWeight: 600 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: C.ink2 }} />
                    <Bar yAxisId="left" dataKey="compromisso" fill="url(#barGradient)" name="Compromisso mensal" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="saldo" stroke={C.gold}
                      strokeWidth={2.5} dot={false} name="Saldo devedor" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
              <div style={cardStyle}>
                <div style={cardHeader}>
                  <div style={cardTitle}>🏦 Saldo por Credor</div>
                  <div style={cardSub}>Top 10 instituições</div>
                </div>
                <div style={{ height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={agregados.credores.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: C.ink2 }}
                        stroke={C.borderStrong}
                        tickFormatter={(v: number) => fmtShort(v)} />
                      <YAxis type="category" dataKey="banco" tick={{ fontSize: 10, fill: C.ink2 }}
                        stroke={C.borderStrong}
                        width={140} />
                      <Tooltip formatter={(v: any) => fmtReal(v)}
                        contentStyle={{
                          background: C.bgPanel3, border: `1px solid ${C.borderStrong}`,
                          borderRadius: 8, color: C.ink, fontSize: 12,
                        }} />
                      <Bar dataKey="saldo" fill={C.accent} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div style={cardStyle}>
                <div style={cardHeader}>
                  <div style={cardTitle}>🚌 Saldo por Tipo de Bem</div>
                  <div style={cardSub}>Distribuição</div>
                </div>
                <div style={{ height: 320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={agregados.tipos} dataKey="saldo" nameKey="tipo"
                        cx="50%" cy="50%" outerRadius={100} innerRadius={55}
                        stroke={C.bg} strokeWidth={2}
                      >
                        {agregados.tipos.map(t => (
                          <Cell key={t.tipo} fill={TIPO_COLORS_DARK[t.tipo] || C.muted} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => fmtReal(v)}
                        contentStyle={{
                          background: C.bgPanel3, border: `1px solid ${C.borderStrong}`,
                          borderRadius: 8, color: C.ink, fontSize: 12,
                        }} />
                      <Legend wrapperStyle={{ fontSize: 11, color: C.ink2 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{
              background: C.bgPanel, padding: 14, borderRadius: 12,
              display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
              marginBottom: 16, border: `1px solid ${C.border}`,
            }}>
              <input
                placeholder="Buscar prefixo, fornecedor, descrição, placa..."
                value={busca} onChange={e => setBusca(e.target.value)}
                style={{
                  flex: '1 1 220px', padding: '10px 12px',
                  border: `1px solid ${C.border}`,
                  borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none',
                  background: C.bgPanel2, color: C.ink,
                }}
              />
              <select value={filtroPlano} onChange={e => setFiltroPlano(e.target.value)} style={selectStyle}>
                <option value="">Todos os planos</option>
                {PLANOS_ORIGEM.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={filtroCredor} onChange={e => setFiltroCredor(e.target.value)} style={selectStyle}>
                <option value="">Todos os credores</option>
                {credoresLista.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={selectStyle}>
                <option value="">Todos os tipos</option>
                {TIPOS_BEM.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={filtroCC} onChange={e => setFiltroCC(e.target.value)} style={selectStyle}>
                <option value="">Todas as filiais</option>
                {CENTROS_CUSTO.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {filtrados.length === 0 ? (
              <div style={{
                padding: 40, textAlign: 'center', color: C.ink2,
                background: C.bgPanel, borderRadius: 12, border: `1px solid ${C.border}`,
              }}>
                {lista.length === 0
                  ? 'Nenhum financiamento cadastrado. Clique em "+ Novo Financiamento" para começar.'
                  : 'Nenhum financiamento encontrado com esses filtros.'}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {filtrados.map(f => (
                  <CardFinanciamento
                    key={f.id} f={f}
                    onEditar={() => abrirEdicao(f)}
                    onExcluir={() => excluir(f)}
                    onPagar={() => pagarParcela(f)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {modalAberto && (
          <ModalFormulario
            financiamento={emEdicao}
            frota={frota}
            historicoVeiculos={historicoVeiculos}
            onCancelar={() => { setModalAberto(false); setEmEdicao(null) }}
            onSalvar={salvar}
          />
        )}
      </div>
    </>
  )
}

// ====================================================================
// CardFinanciamento (com destaque de veículos)
// ====================================================================
function CardFinanciamento({ f, onEditar, onExcluir, onPagar }: {
  f: Financiamento
  onEditar: () => void
  onExcluir: () => void
  onPagar: () => void
}) {
  const saldo = calcSaldoDevedor(f)
  const restantes = calcRestantes(f)
  const pagas = calcParcelasPagasAteHoje(f)
  const pct = calcProgressoPct(f)
  const quit = calcQuitacao(f)
  const completed = pagas >= f.totalParcelas

  const corBarra = completed ? C.teal : pct >= 75 ? C.green : pct >= 25 ? C.gold : pct > 0 ? C.amber : C.red
  const corBorda = f.novoContrato ? C.green : f.temErro ? C.amber : C.accent

  const veiculos = parseVeiculos(f.prefixo || '')

  return (
    <div style={{
      background: C.bgPanel,
      borderRadius: 10,
      borderLeft: `3px solid ${corBorda}`,
      border: `1px solid ${C.border}`,
      borderLeftWidth: 3,
      borderLeftColor: corBorda,
      padding: 14,
      opacity: completed ? 0.55 : 1,
      transition: 'all 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
              {f.descricao}
            </span>
            <span style={tagStyle(f.planoOrigem === 'Veiculos' ? C.teal : C.accent)}>
              {f.planoOrigem}
            </span>
            <span style={tagStyle(C.muted)}>{f.tipo}</span>
            {f.novoContrato && <span style={tagStyle(C.green)}>🆕 Novo</span>}
            {f.reclassificado && <span style={tagStyle(C.accent2)}>Reclass.</span>}
            {f.temErro && <span style={tagStyle(C.amber)}>⚠️ Erro</span>}
            {completed && <span style={tagStyle(C.teal)}>✓ Quitado</span>}
          </div>

          {/* === VEÍCULOS EM DESTAQUE === */}
          {veiculos.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              marginTop: 8, marginBottom: 10,
              padding: '10px 12px',
              background: `linear-gradient(135deg, ${C.gold}12 0%, ${C.gold}06 100%)`,
              border: `1px solid ${C.gold}40`,
              borderRadius: 8,
            }}>
              <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>🚒</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, alignItems: 'center' }}>
                {veiculos.length > 1 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: C.gold,
                    background: `${C.gold}20`, border: `1px solid ${C.gold}50`,
                    padding: '2px 8px', borderRadius: 4, letterSpacing: 0.4,
                  }}>{veiculos.length} VEÍCULOS</span>
                )}
                {veiculos.map((v, i) => (
                  <span key={i} style={{
                    fontSize: 14, fontWeight: 700, color: C.ink,
                    background: C.bgPanel2,
                    border: `1px solid ${C.gold}40`,
                    padding: '4px 10px', borderRadius: 6,
                    fontFamily: 'monospace', letterSpacing: '-0.01em',
                    boxShadow: `0 1px 4px ${C.gold}20`,
                  }}>{v}</span>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: C.ink2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>🏦 <strong style={{ color: C.ink }}>{f.fornecedor}</strong></span>
            <span>📍 {f.cc.replace('GARAGEM ', '')}</span>
            <span>💰 <strong style={{ color: C.gold }}>{fmtShort(f.valorParcela)}</strong>/mês</span>
            <span>📅 {quit ? `Quita ${fmtMonth(quit)}` : '–'}</span>
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              flex: 1, height: 6, background: C.bgPanel3,
              borderRadius: 3, overflow: 'hidden',
              border: `1px solid ${C.border}`,
            }}>
              <div style={{
                height: '100%', width: `${pct.toFixed(1)}%`, background: corBarra,
                transition: 'width 0.4s ease', boxShadow: `0 0 8px ${corBarra}80`,
              }} />
            </div>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: C.ink2, minWidth: 80, textAlign: 'right' }}>
              <strong style={{ color: corBarra }}>{pagas}/{f.totalParcelas}</strong>
              <span style={{ color: C.muted, display: 'block', fontSize: 10 }}>
                {completed ? 'quitado' : `${restantes} a vencer`}
              </span>
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 130 }}>
          <div style={{
            fontSize: 17, fontWeight: 700, color: C.gold,
            fontFamily: 'monospace', letterSpacing: '-0.02em',
          }}>
            {fmtShort(saldo)}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {!completed && (
              <button onClick={onPagar} style={iconBtn(C.green)} title="Marcar próxima parcela como paga">✓</button>
            )}
            <button onClick={onEditar} style={iconBtn(C.accent)} title="Editar">✎</button>
            <button onClick={onExcluir} style={iconBtn(C.red)} title="Excluir">🗑</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ====================================================================
// VeiculosInput — Input de tags com autocomplete
// ====================================================================
function VeiculosInput({ valor, onChange, frota, historico }: {
  valor: string[]
  onChange: (v: string[]) => void
  frota: FrotaVeiculo[]
  historico: string[]
}) {
  const [texto, setTexto] = useState('')
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Gera sugestões a partir da frota e do histórico
  const sugestoes = useMemo(() => {
    const set = new Map<string, string>()
    // Frota: formata como "prefixo - placa - modelo"
    frota.forEach(v => {
      const formatado = [v.nFrota, v.placa, v.modelo].filter(Boolean).join(' - ')
      if (formatado) set.set(formatado.toLowerCase(), formatado)
    })
    // Histórico: textos já usados em outros financiamentos
    historico.forEach(h => {
      if (!set.has(h.toLowerCase())) set.set(h.toLowerCase(), h)
    })
    const todas = Array.from(set.values())
    // Filtra pelo texto digitado e remove os já adicionados
    const t = texto.trim().toLowerCase()
    const valoresLower = new Set(valor.map(v => v.toLowerCase()))
    return todas
      .filter(s => !valoresLower.has(s.toLowerCase()))
      .filter(s => !t || s.toLowerCase().includes(t))
      .slice(0, 8)
  }, [texto, valor, frota, historico])

  const adicionar = (item: string) => {
    const limpo = item.trim()
    if (!limpo) return
    if (valor.some(v => v.toLowerCase() === limpo.toLowerCase())) return
    onChange([...valor, limpo])
    setTexto('')
    setMostrarSugestoes(false)
    setHighlighted(0)
    inputRef.current?.focus()
  }

  const remover = (idx: number) => {
    onChange(valor.filter((_, i) => i !== idx))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (mostrarSugestoes && sugestoes[highlighted]) {
        adicionar(sugestoes[highlighted])
      } else if (texto.trim()) {
        adicionar(texto)
      }
    } else if (e.key === ',' || e.key === ';') {
      e.preventDefault()
      if (texto.trim()) adicionar(texto)
    } else if (e.key === 'Backspace' && !texto && valor.length > 0) {
      // Remove o último com backspace quando o input está vazio
      remover(valor.length - 1)
    } else if (e.key === 'ArrowDown' && mostrarSugestoes) {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, sugestoes.length - 1))
    } else if (e.key === 'ArrowUp' && mostrarSugestoes) {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, 0))
    } else if (e.key === 'Escape') {
      setMostrarSugestoes(false)
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6,
        padding: 8,
        background: C.bgPanel2,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        minHeight: 44,
        cursor: 'text',
      }} onClick={() => inputRef.current?.focus()}>
        {valor.map((v, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 10px',
            background: `${C.gold}20`,
            border: `1px solid ${C.gold}50`,
            borderRadius: 6,
            fontSize: 13, fontWeight: 600, color: C.ink,
            fontFamily: 'monospace',
          }}>
            🚒 {v}
            <button type="button" onClick={(e) => { e.stopPropagation(); remover(i) }} style={{
              background: 'transparent', border: 'none', color: C.gold,
              cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1, fontWeight: 700,
            }}>×</button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={texto}
          onChange={e => { setTexto(e.target.value); setMostrarSugestoes(true); setHighlighted(0) }}
          onFocus={() => setMostrarSugestoes(true)}
          onBlur={() => setTimeout(() => setMostrarSugestoes(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder={valor.length === 0 ? 'Ex: 4832 - ETC1044 - Master  (Enter para adicionar)' : 'Adicionar mais...'}
          style={{
            flex: 1, minWidth: 200,
            background: 'transparent',
            border: 'none', outline: 'none',
            fontSize: 13, color: C.ink, fontFamily: 'inherit',
            padding: '4px 4px',
          }}
        />
      </div>
      {mostrarSugestoes && sugestoes.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          marginTop: 4, zIndex: 100,
          background: C.bgPanel3,
          border: `1px solid ${C.borderStrong}`,
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          maxHeight: 280, overflowY: 'auto',
        }}>
          <div style={{
            padding: '8px 12px', fontSize: 10, fontWeight: 700,
            color: C.muted, letterSpacing: 0.4, textTransform: 'uppercase',
            borderBottom: `1px solid ${C.border}`,
          }}>
            Sugestões ({sugestoes.length})
          </div>
          {sugestoes.map((s, i) => (
            <div
              key={s}
              onMouseDown={(e) => { e.preventDefault(); adicionar(s) }}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                padding: '10px 12px',
                background: i === highlighted ? `${C.accent}20` : 'transparent',
                color: i === highlighted ? C.ink : C.ink2,
                fontSize: 13,
                fontFamily: 'monospace',
                cursor: 'pointer',
                borderLeft: i === highlighted ? `3px solid ${C.accent}` : '3px solid transparent',
                transition: 'all 0.1s',
              }}
            >
              🚒 {s}
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>
        💡 Digite e pressione <strong style={{ color: C.ink2 }}>Enter</strong>, <strong style={{ color: C.ink2 }}>vírgula</strong> ou <strong style={{ color: C.ink2 }}>;</strong> para adicionar.
        Use as setas ↑↓ para escolher uma sugestão.
      </div>
    </div>
  )
}

// ====================================================================
// ModalFormulario (com campo Veículos)
// ====================================================================
function ModalFormulario({ financiamento, frota, historicoVeiculos, onCancelar, onSalvar }: {
  financiamento: Financiamento | null
  frota: FrotaVeiculo[]
  historicoVeiculos: string[]
  onCancelar: () => void
  onSalvar: (dados: Partial<Financiamento>) => void
}) {
  const [descricao, setDescricao] = useState(financiamento?.descricao || '')
  const [tipo, setTipo] = useState<TipoBem>(financiamento?.tipo || 'Van')
  const [planoOrigem, setPlanoOrigem] = useState<PlanoOrigem>(financiamento?.planoOrigem || 'Financiamentos')
  const [veiculos, setVeiculos] = useState<string[]>(parseVeiculos(financiamento?.prefixo || ''))
  const [cc, setCC] = useState(financiamento?.cc || 'GARAGEM AGUAS DE LINDOIA')
  const [fornecedor, setFornecedor] = useState(financiamento?.fornecedor || '')
  const [parcelaAtual, setParcelaAtual] = useState(financiamento?.parcelaAtual ?? 0)
  const [totalParcelas, setTotalParcelas] = useState(financiamento?.totalParcelas || 48)
  const [valorParcela, setValorParcela] = useState(financiamento?.valorParcela || 0)
  const [proximoVenc, setProximoVenc] = useState(financiamento?.proximoVenc || (() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1)
    return d.toISOString().substring(0, 10)
  })())
  const [frequencia, setFrequencia] = useState(financiamento?.frequencia || 'mensal')
  const [observacao, setObservacao] = useState(financiamento?.observacao || '')

  const handleSalvar = () => {
    if (!descricao || !fornecedor || !valorParcela || !totalParcelas || !proximoVenc) {
      alert('Preencha os campos obrigatórios (*)')
      return
    }
    onSalvar({
      descricao, tipo, planoOrigem,
      prefixo: joinVeiculos(veiculos),  // salva como string única separada por ;
      cc, fornecedor,
      parcelaAtual, totalParcelas, valorParcela, proximoVenc,
      frequencia, observacao,
    })
  }

  return (
    <div onClick={onCancelar} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20, backdropFilter: 'blur(4px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.bgPanel, borderRadius: 12, maxWidth: 620, width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
        border: `1px solid ${C.borderStrong}`,
        boxShadow: `0 20px 80px rgba(0,0,0,0.5), 0 0 0 1px ${C.accent}30`,
        color: C.ink,
      }}>
        <div style={{
          padding: '18px 22px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.ink }}>
            {financiamento ? 'Editar Financiamento' : 'Novo Financiamento'}
          </div>
          <button onClick={onCancelar} style={{
            background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: C.ink2,
          }}>✕</button>
        </div>
        <div style={{ padding: 22 }}>
          <Field label="Descrição *">
            <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder="Ex: Van prefixo 4832 (placa ETC1044)" style={inputStyle} />
          </Field>

          {/* === CAMPO VEÍCULOS COM AUTOCOMPLETE === */}
          <Field label={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              🚒 Veículo(s) deste contrato
              <span style={{
                fontSize: 9, padding: '2px 6px',
                background: `${C.gold}20`, color: C.gold,
                border: `1px solid ${C.gold}50`,
                borderRadius: 3, letterSpacing: 0.4,
              }}>NOVO</span>
            </span> as any
          }>
            <VeiculosInput
              valor={veiculos}
              onChange={setVeiculos}
              frota={frota}
              historico={historicoVeiculos}
            />
          </Field>

          <FieldRow>
            <Field label="Tipo *">
              <select value={tipo} onChange={e => setTipo(e.target.value as TipoBem)} style={inputStyle}>
                {TIPOS_BEM.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Plano de Origem *">
              <select value={planoOrigem} onChange={e => setPlanoOrigem(e.target.value as PlanoOrigem)} style={inputStyle}>
                {PLANOS_ORIGEM.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
          </FieldRow>
          <Field label="Centro de Custo *">
            <select value={cc} onChange={e => setCC(e.target.value)} style={inputStyle}>
              {CENTROS_CUSTO.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Credor / Fornecedor *">
            <input type="text" value={fornecedor} onChange={e => setFornecedor(e.target.value)}
              placeholder="Ex: BANCO RCI BRASIL S.A" style={inputStyle} />
          </Field>
          <FieldRow>
            <Field label="Parcelas Pagas (no cadastro)">
              <input type="number" min={0} value={parcelaAtual}
                onChange={e => setParcelaAtual(parseInt(e.target.value) || 0)} style={inputStyle} />
              <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                0 = nenhuma paga ainda
              </div>
            </Field>
            <Field label="Total de Parcelas *">
              <input type="number" min={1} value={totalParcelas}
                onChange={e => setTotalParcelas(parseInt(e.target.value) || 1)} style={inputStyle} />
            </Field>
          </FieldRow>
          <FieldRow>
            <Field label="Valor da Parcela (R$) *">
              <input type="number" step={0.01} min={0} value={valorParcela}
                onChange={e => setValorParcela(parseFloat(e.target.value) || 0)} style={inputStyle} />
            </Field>
            <Field label="Próxima parcela a vencer *">
              <input type="date" value={proximoVenc} onChange={e => setProximoVenc(e.target.value)} style={inputStyle} />
            </Field>
          </FieldRow>
          <Field label="Frequência">
            <select value={frequencia} onChange={e => setFrequencia(e.target.value as any)} style={inputStyle}>
              <option value="mensal">Mensal</option>
              <option value="semanal">Semanal</option>
              <option value="unico">Pagamento único</option>
            </select>
          </Field>
          <Field label="Observação (opcional)">
            <textarea value={observacao} onChange={e => setObservacao(e.target.value)}
              rows={2} style={inputStyle}
              placeholder="Ex: Contrato Nº 20042165325, juros embutidos R$ 140k" />
          </Field>
        </div>
        <div style={{
          padding: '14px 22px', borderTop: `1px solid ${C.border}`,
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}>
          <button onClick={onCancelar} style={{
            padding: '10px 18px', background: C.bgPanel3, color: C.ink2,
            border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancelar</button>
          <button onClick={handleSalvar} style={{
            padding: '10px 18px',
            background: `linear-gradient(135deg, ${C.accent} 0%, ${C.accent3} 100%)`,
            color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: `0 4px 12px ${C.accent}40`,
          }}>Salvar</button>
        </div>
      </div>
    </div>
  )
}

// ====================================================================
// Componentes auxiliares
// ====================================================================
const Field = ({ label, children }: { label: any; children: any }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{
      display: 'block', fontSize: 11, fontWeight: 600, color: C.ink2,
      textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 6,
    }}>{label}</label>
    {children}
  </div>
)

const FieldRow = ({ children }: { children: any }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
)

const KPI = ({ titulo, valor, cor, sub, highlight }: {
  titulo: string; valor: string; cor: string; sub?: string; highlight?: boolean
}) => (
  <div style={{
    background: highlight
      ? `linear-gradient(135deg, ${C.bgPanel2} 0%, ${C.bgPanel} 100%)`
      : C.bgPanel,
    padding: 18, borderRadius: 12,
    border: `1px solid ${C.border}`,
    borderTop: `2px solid ${cor}`,
    position: 'relative', overflow: 'hidden',
    boxShadow: highlight ? `0 4px 20px ${cor}20` : 'none',
  }}>
    {highlight && (
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${cor}80 50%, transparent)`,
      }} />
    )}
    <div style={{
      fontSize: 10, color: C.muted, fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: 0.5,
    }}>
      {titulo}
    </div>
    <div style={{
      fontSize: 24, fontWeight: 700, color: cor,
      marginTop: 8, fontFamily: 'monospace',
      letterSpacing: '-0.025em',
    }}>{valor}</div>
    {sub && <div style={{ fontSize: 11, color: C.ink2, marginTop: 6 }}>{sub}</div>}
  </div>
)

const cardStyle: React.CSSProperties = {
  background: C.bgPanel, padding: 22, borderRadius: 12,
  border: `1px solid ${C.border}`,
}
const cardHeader: React.CSSProperties = {
  marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${C.border}`,
}
const cardTitle: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: C.ink }
const cardSub: React.CSSProperties = { fontSize: 12, color: C.muted, marginTop: 4 }

const selectStyle: React.CSSProperties = {
  padding: '10px 12px',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 13,
  background: C.bgPanel2,
  color: C.ink,
  fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: `1px solid ${C.border}`,
  borderRadius: 8, fontSize: 13,
  background: C.bgPanel2,
  color: C.ink,
  fontFamily: 'inherit', outline: 'none',
}

const toggleBtn = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  background: active
    ? `linear-gradient(135deg, ${C.accent} 0%, ${C.accent3} 100%)`
    : 'transparent',
  color: active ? '#fff' : C.ink2,
  border: 'none', borderRadius: 7,
  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  transition: 'all 0.15s',
  boxShadow: active ? `0 2px 8px ${C.accent}40` : 'none',
})

const tagStyle = (cor: string): React.CSSProperties => ({
  fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
  background: `${cor}18`,
  color: cor,
  letterSpacing: 0.04,
  border: `1px solid ${cor}30`,
})

const iconBtn = (cor: string): React.CSSProperties => ({
  width: 30, height: 30, background: 'transparent',
  border: `1px solid ${cor}40`, color: cor, borderRadius: 6,
  fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.15s',
})
