'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, ComposedChart, ResponsiveContainer,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell, PieChart, Pie,
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

type Vista = 'dashboard' | 'lista'

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

  useEffect(() => { carregar() }, [carregar])

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
    const tiposPorMes: Record<string, Record<string, number>> = {}

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
          if (!tiposPorMes[key]) tiposPorMes[key] = {}
          tiposPorMes[key][f.tipo] = (tiposPorMes[key][f.tipo] || 0) + f.valorParcela
        }
      } else {
        for (let i = 0; i < restantes; i++) {
          const tot = (sm - 1) + i
          const y = sy + Math.floor(tot / 12)
          const m = (tot % 12) + 1
          const key = `${y}-${String(m).padStart(2, '0')}`
          out[key] = (out[key] || 0) + f.valorParcela
          if (!tiposPorMes[key]) tiposPorMes[key] = {}
          tiposPorMes[key][f.tipo] = (tiposPorMes[key][f.tipo] || 0) + f.valorParcela
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

  if (carregando) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 12 }}>
        Carregando financiamentos...
      </div>
    )
  }

  // ============ KPIs ============
  const proxMes = cronograma[0]?.compromisso || 0
  const proxMesNome = cronograma[0]?.mes || '–'
  const maiorContrato = [...lista].sort((a, b) => calcSaldoDevedor(b) - calcSaldoDevedor(a))[0]
  const novosCount = lista.filter(f => f.novoContrato).length

  return (
    <>
      {/* Toggle de vista */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <div style={{
          display: 'inline-flex', background: '#fff', borderRadius: 8,
          padding: 4, border: '1px solid #e5e7eb',
        }}>
          <button onClick={() => setVista('dashboard')} style={toggleBtn(vista === 'dashboard')}>
            📊 Dashboard
          </button>
          <button onClick={() => setVista('lista')} style={toggleBtn(vista === 'lista')}>
            📋 Lista de contratos
          </button>
        </div>
        <button onClick={abrirNovo} style={{
          marginLeft: 'auto', padding: '10px 16px', background: '#2D3A6B', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>+ Novo Financiamento</button>
      </div>

      {vista === 'dashboard' ? (
        <>
          {/* KPIs */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
            gap: 14, marginBottom: 20,
          }}>
            <KPI titulo="Saldo Devedor" valor={fmtShort(agregados.totalSaldo)} cor="#dc2626"
              sub={`${lista.length} contratos`} />
            <KPI titulo="Compromisso Mensal" valor={fmtShort(agregados.totalMensal)} cor="#2D3A6B"
              sub="parcelas regulares" />
            <KPI titulo={`Próximo: ${proxMesNome}`} valor={fmtShort(proxMes)} cor="#4AABDB"
              sub="compromisso já contratado" />
            <KPI titulo="Maior Credor"
              valor={fmtShort(agregados.credores[0]?.saldo || 0)} cor="#7c3aed"
              sub={`${(agregados.credores[0]?.banco || '–').substring(0, 18)} (${agregados.credores[0]?.qtd || 0})`} />
            <KPI titulo="Maior Contrato"
              valor={fmtShort(maiorContrato ? calcSaldoDevedor(maiorContrato) : 0)} cor="#f59e0b"
              sub={maiorContrato?.descricao.substring(0, 22) || '–'} />
            <KPI titulo="Novos Contratos" valor={String(novosCount)} cor="#047857"
              sub="marcados como novos" />
          </div>

          {/* Cronograma */}
          <div style={cardStyle}>
            <div style={cardHeader}>
              <div style={cardTitle}>📅 Cronograma de Compromisso Mensal</div>
              <div style={cardSub}>Barras = compromisso · Linha = saldo devedor decrescente</div>
            </div>
            <div style={{ height: 380 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={cronogramaComSaldo}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(v: number) => fmtShort(v)} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#047857' }}
                    tickFormatter={(v: number) => fmtShort(v)} />
                  <Tooltip
                    formatter={(v: any) => fmtReal(v)}
                    contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="compromisso" fill="#2D3A6B" name="Compromisso mensal" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="saldo" stroke="#047857"
                    strokeWidth={2.5} dot={false} name="Saldo devedor" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Por credor + por tipo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
            <div style={cardStyle}>
              <div style={cardHeader}>
                <div style={cardTitle}>🏦 Saldo por Credor</div>
                <div style={cardSub}>Top 10 instituições</div>
              </div>
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agregados.credores.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={(v: number) => fmtShort(v)} />
                    <YAxis type="category" dataKey="banco" tick={{ fontSize: 10, fill: '#64748b' }} width={140} />
                    <Tooltip formatter={(v: any) => fmtReal(v)}
                      contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }} />
                    <Bar dataKey="saldo" fill="#7c3aed" radius={[0, 3, 3, 0]} />
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
                    >
                      {agregados.tipos.map(t => (
                        <Cell key={t.tipo} fill={CORES_TIPO[t.tipo as TipoBem] || '#64748b'} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmtReal(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Filtros */}
          <div style={{
            background: '#fff', padding: 14, borderRadius: 12,
            display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
            marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          }}>
            <input
              placeholder="Buscar prefixo, fornecedor, descrição..."
              value={busca} onChange={e => setBusca(e.target.value)}
              style={{
                flex: '1 1 220px', padding: '10px 12px', border: '1px solid #e5e7eb',
                borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none',
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

          {/* Cards de financiamento */}
          {filtrados.length === 0 ? (
            <div style={{
              padding: 40, textAlign: 'center', color: '#64748b',
              background: '#fff', borderRadius: 12,
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
          onCancelar={() => { setModalAberto(false); setEmEdicao(null) }}
          onSalvar={salvar}
        />
      )}
    </>
  )
}

// ====================================================================
// CardFinanciamento
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

  const corBarra = completed ? '#14b8a6' : pct >= 75 ? '#3ecf8e' : pct >= 25 ? '#d4af37' : pct > 0 ? '#fbbf24' : '#dc2626'

  return (
    <div style={{
      background: '#fff', borderRadius: 8,
      borderLeft: `4px solid ${f.novoContrato ? '#3ecf8e' : f.temErro ? '#fbbf24' : '#7c3aed'}`,
      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      opacity: completed ? 0.6 : 1,
      padding: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
              {f.descricao}
            </span>
            <span style={tagStyle(f.planoOrigem === 'Veiculos' ? '#14b8a6' : '#7c3aed')}>
              {f.planoOrigem}
            </span>
            <span style={tagStyle('#64748b')}>{f.tipo}</span>
            {f.novoContrato && <span style={tagStyle('#3ecf8e')}>🆕 Novo</span>}
            {f.reclassificado && <span style={tagStyle('#4AABDB')}>Reclass.</span>}
            {f.temErro && <span style={tagStyle('#fbbf24')}>⚠️ Erro</span>}
            {completed && <span style={tagStyle('#14b8a6')}>✓ Quitado</span>}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>🏦 <strong>{f.fornecedor}</strong></span>
            <span>📍 {f.cc.replace('GARAGEM ', '')}</span>
            <span>💰 <strong>{fmtShort(f.valorParcela)}</strong>/mês</span>
            <span>📅 {quit ? `Quita ${fmtMonth(quit)}` : '–'}</span>
          </div>
          {/* Barra de progresso */}
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct.toFixed(1)}%`, background: corBarra,
                transition: 'width 0.4s ease',
              }} />
            </div>
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#475569', minWidth: 80, textAlign: 'right' }}>
              <strong style={{ color: corBarra }}>{pagas}/{f.totalParcelas}</strong>
              <span style={{ color: '#94a3b8', display: 'block', fontSize: 10 }}>
                {completed ? 'quitado' : `${restantes} a vencer`}
              </span>
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 130 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#7c3aed', fontFamily: 'monospace' }}>
            {fmtShort(saldo)}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {!completed && (
              <button onClick={onPagar} style={iconBtn('#047857')} title="Marcar próxima parcela como paga">✓</button>
            )}
            <button onClick={onEditar} style={iconBtn('#2D3A6B')} title="Editar">✎</button>
            <button onClick={onExcluir} style={iconBtn('#dc2626')} title="Excluir">🗑</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ====================================================================
// ModalFormulario
// ====================================================================
function ModalFormulario({ financiamento, onCancelar, onSalvar }: {
  financiamento: Financiamento | null
  onCancelar: () => void
  onSalvar: (dados: Partial<Financiamento>) => void
}) {
  const [descricao, setDescricao] = useState(financiamento?.descricao || '')
  const [tipo, setTipo] = useState<TipoBem>(financiamento?.tipo || 'Van')
  const [planoOrigem, setPlanoOrigem] = useState<PlanoOrigem>(financiamento?.planoOrigem || 'Financiamentos')
  const [prefixo, setPrefixo] = useState(financiamento?.prefixo || '')
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
      descricao, tipo, planoOrigem, prefixo, cc, fornecedor,
      parcelaAtual, totalParcelas, valorParcela, proximoVenc,
      frequencia, observacao,
    })
  }

  return (
    <div onClick={onCancelar} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 12, maxWidth: 580, width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #e5e7eb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>
            {financiamento ? 'Editar Financiamento' : 'Novo Financiamento'}
          </div>
          <button onClick={onCancelar} style={{
            background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b',
          }}>✕</button>
        </div>
        <div style={{ padding: 22 }}>
          <Field label="Descrição *">
            <input type="text" value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder="Ex: Van prefixo 4832 (placa ETC1044)" style={inputStyle} />
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
          <FieldRow>
            <Field label="Prefixo / Placa">
              <input type="text" value={prefixo} onChange={e => setPrefixo(e.target.value)}
                placeholder="Ex: 4832 ou EZU4F43" style={inputStyle} />
            </Field>
            <Field label="Centro de Custo *">
              <select value={cc} onChange={e => setCC(e.target.value)} style={inputStyle}>
                {CENTROS_CUSTO.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </FieldRow>
          <Field label="Credor / Fornecedor *">
            <input type="text" value={fornecedor} onChange={e => setFornecedor(e.target.value)}
              placeholder="Ex: BANCO RCI BRASIL S.A" style={inputStyle} />
          </Field>
          <FieldRow>
            <Field label="Parcelas Pagas (no cadastro)">
              <input type="number" min={0} value={parcelaAtual}
                onChange={e => setParcelaAtual(parseInt(e.target.value) || 0)} style={inputStyle} />
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
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
          padding: '14px 22px', borderTop: '1px solid #e5e7eb',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}>
          <button onClick={onCancelar} style={{
            padding: '10px 18px', background: '#f1f5f9', color: '#64748b',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancelar</button>
          <button onClick={handleSalvar} style={{
            padding: '10px 18px', background: '#2D3A6B', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Salvar</button>
        </div>
      </div>
    </div>
  )
}

// ====================================================================
// Componentes auxiliares
// ====================================================================
const Field = ({ label, children }: { label: string; children: any }) => (
  <div style={{ marginBottom: 12 }}>
    <label style={{
      display: 'block', fontSize: 11, fontWeight: 600, color: '#475569',
      textTransform: 'uppercase', letterSpacing: 0.04, marginBottom: 5,
    }}>{label}</label>
    {children}
  </div>
)

const FieldRow = ({ children }: { children: any }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
)

const KPI = ({ titulo, valor, cor, sub }: { titulo: string; valor: string; cor: string; sub?: string }) => (
  <div style={{
    background: '#fff', padding: 16, borderRadius: 12,
    borderTop: `3px solid ${cor}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  }}>
    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {titulo}
    </div>
    <div style={{ fontSize: 22, fontWeight: 700, color: cor, marginTop: 6, fontFamily: 'monospace' }}>{valor}</div>
    {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{sub}</div>}
  </div>
)

// ====================================================================
// Estilos compartilhados
// ====================================================================
const cardStyle: React.CSSProperties = {
  background: '#fff', padding: 22, borderRadius: 12,
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: 16,
}
const cardHeader: React.CSSProperties = {
  marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid #f1f5f9',
}
const cardTitle: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#1e293b' }
const cardSub: React.CSSProperties = { fontSize: 12, color: '#64748b', marginTop: 3 }

const selectStyle: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8,
  fontSize: 13, background: '#fff', fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid #e5e7eb',
  borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none',
}

const toggleBtn = (active: boolean): React.CSSProperties => ({
  padding: '8px 14px', background: active ? '#2D3A6B' : 'transparent',
  color: active ? '#fff' : '#64748b', border: 'none', borderRadius: 6,
  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  transition: 'all 0.15s',
})

const tagStyle = (cor: string): React.CSSProperties => ({
  fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 3,
  background: `${cor}15`, color: cor, letterSpacing: 0.04,
})

const iconBtn = (cor: string): React.CSSProperties => ({
  width: 28, height: 28, background: 'transparent',
  border: `1px solid ${cor}33`, color: cor, borderRadius: 5,
  fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
})
