'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtK = (v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : fmt(v)

interface Fechamento {
  id: string
  mesAno: string
  tipo: 'antecipacao' | 'folha'
  arquivo: string
  totalGeral: number
  totalPorCidade: Record<string, number>
  totalColaboradores: number
  dataImport: string
}

function labelMesAno(ma: string) {
  const [ano, mes] = ma.split('-')
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  return `${nomes[parseInt(mes) - 1]}/${ano}`
}

function labelMesCurto(ma: string) {
  const [ano, mes] = ma.split('-')
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${nomes[parseInt(mes) - 1]}/${ano.slice(2)}`
}

const CORES = ['#2D3A6B','#4AABDB','#10b981','#f59e0b','#ef4444','#8b5cf6',
               '#ec4899','#06b6d4','#84cc16','#f97316','#14b8a6','#6366f1','#a855f7','#fb7185']

// ─── Label customizado: total acima da barra vertical ───────────────────────
// Usado na barra de FOLHA (topo do stack). Só renderiza quando folha > 0.
// Usado na barra de ANTECIPAÇÃO quando não há folha naquele mês.
function makeLabelMensal(dados: Array<{ folha: number; total: number }>, isAntecipacao: boolean) {
  const LabelMensal = (props: any) => {
    const { x, y, width, index } = props
    const d = dados[index]
    if (!d || d.total <= 0) return null
    if (isAntecipacao && d.folha > 0) return null   // folha vai mostrar
    if (!isAntecipacao && (!d.folha || d.folha === 0)) return null  // antecipação vai mostrar
    return (
      <text
        x={x + width / 2}
        y={y - 5}
        textAnchor="middle"
        fontSize={10}
        fontWeight={700}
        fill="#374151"
      >
        {fmtK(d.total)}
      </text>
    )
  }
  LabelMensal.displayName = 'LabelMensal'
  return LabelMensal
}

// ─── Label customizado: total à direita da barra horizontal ─────────────────
// Usado na barra da direita do stack (folha ou antecipação, dependendo do caso).
function makeLabelCidade(dados: Array<{ folha: number; antecipacao: number; total: number }>, isAntecipacao: boolean) {
  const LabelCidade = (props: any) => {
    const { x, y, width, height, index } = props
    const d = dados[index]
    if (!d || d.total <= 0) return null
    if (isAntecipacao && d.folha > 0) return null   // folha vai mostrar
    if (!isAntecipacao && (!d.folha || d.folha === 0)) return null  // antecipação vai mostrar
    return (
      <text
        x={x + width + 6}
        y={y + height / 2 + 4}
        textAnchor="start"
        fontSize={11}
        fontWeight={700}
        fill="#374151"
      >
        {fmtK(d.total)}
      </text>
    )
  }
  LabelCidade.displayName = 'LabelCidade'
  return LabelCidade
}

// ─── Label para barra única (modo antecipação ou folha isolado) ──────────────
const LabelSimples = (props: any) => {
  const { x, y, width, height, value, layout } = props
  if (!value || value <= 0) return null
  if (layout === 'vertical') {
    // barra horizontal
    return (
      <text x={x + width + 6} y={y + height / 2 + 4} textAnchor="start" fontSize={11} fontWeight={700} fill="#374151">
        {fmtK(value)}
      </text>
    )
  }
  // barra vertical
  return (
    <text x={x + width / 2} y={y - 5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#374151">
      {fmtK(value)}
    </text>
  )
}

export default function ResumoDPGeral() {
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [mesSel, setMesSel] = useState<string>('todos')
  const [tipoVis, setTipoVis] = useState<'antecipacao' | 'folha' | 'total'>('total')

  const carregar = useCallback(async () => {
    setCarregando(true)
    const res = await fetch('/api/dp/fechamentos')
    const data = await res.json()
    setFechamentos(data)
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const removerFechamento = async (id: string) => {
    if (!confirm('Remover este fechamento?')) return
    await fetch('/api/dp/fechamentos', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await carregar()
    if (fechamentos.find(f => f.id === id)) setMesSel('todos')
  }

  const mesesDisponiveis = useMemo(() =>
    Array.from(new Set(fechamentos.map(f => f.mesAno))).sort().reverse(),
  [fechamentos])

  const fechsFiltrados = useMemo(() =>
    mesSel === 'todos' ? fechamentos : fechamentos.filter(f => f.mesAno === mesSel),
  [fechamentos, mesSel])

  const fechAntecip = fechsFiltrados.find(f => f.tipo === 'antecipacao')
  const fechFolha   = fechsFiltrados.find(f => f.tipo === 'folha')

  const totalAntecipacao = fechAntecip?.totalGeral ?? 0
  const totalFolha       = fechFolha?.totalGeral ?? 0
  const totalGeral       = totalAntecipacao + totalFolha

  const dadosPorCidade = useMemo(() => {
    const mapa: Record<string, { antecipacao: number; folha: number }> = {}
    for (const f of fechsFiltrados) {
      for (const [cidade, valor] of Object.entries(f.totalPorCidade || {})) {
        if (!mapa[cidade]) mapa[cidade] = { antecipacao: 0, folha: 0 }
        if (f.tipo === 'antecipacao') mapa[cidade].antecipacao += valor
        else mapa[cidade].folha += valor
      }
    }
    return Object.entries(mapa)
      .map(([cidade, vals]) => ({ cidade, ...vals, total: vals.antecipacao + vals.folha }))
      .filter(d => d.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [fechsFiltrados])

  const evolucaoMensal = useMemo(() => {
    return mesesDisponiveis.slice().reverse().map(mes => {
      const fsMes = fechamentos.filter(f => f.mesAno === mes)
      const antecipacao = fsMes.find(f => f.tipo === 'antecipacao')?.totalGeral ?? 0
      const folha       = fsMes.find(f => f.tipo === 'folha')?.totalGeral ?? 0
      return { label: labelMesCurto(mes), mes, antecipacao, folha, total: antecipacao + folha }
    })
  }, [fechamentos, mesesDisponiveis])

  // Memoizar os componentes de label para evitar recriação desnecessária
  const LabelMensalAntecip = useMemo(() => makeLabelMensal(evolucaoMensal, true), [evolucaoMensal])
  const LabelMensalFolha   = useMemo(() => makeLabelMensal(evolucaoMensal, false), [evolucaoMensal])
  const LabelCidadeAntecip = useMemo(() => makeLabelCidade(dadosPorCidade, true), [dadosPorCidade])
  const LabelCidadeFolha   = useMemo(() => makeLabelCidade(dadosPorCidade, false), [dadosPorCidade])

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <div style={{ fontWeight: 700, color: '#2D3A6B', marginBottom: 6 }}>{label}</div>
        {payload.map((p: any, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3, alignItems: 'center' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: p.fill || p.color, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: '#6b7280' }}>{p.name}:</span>
            <span style={{ fontWeight: 600 }}>{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    )
  }

  if (carregando) return <div className="estado-vazio">Carregando dados...</div>

  if (fechamentos.length === 0) return (
    <div className="estado-vazio">
      <div className="estado-icone">📊</div>
      <div className="estado-titulo">Nenhum fechamento importado</div>
      <div className="estado-desc">Importe uma folha Excel para visualizar o resumo</div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── Barra de controles ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.75rem 1rem', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', boxShadow: 'var(--shadow-sm)' }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Fechamento:</label>

        <select
          value={mesSel}
          onChange={e => setMesSel(e.target.value)}
          style={{ padding: '0.4rem 0.7rem', fontSize: 13, fontWeight: 600, borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text)', minWidth: 200 }}
        >
          <option value="todos">Todos os meses</option>
          {mesesDisponiveis.map(ma => (
            <option key={ma} value={ma}>{labelMesAno(ma)}</option>
          ))}
        </select>

        {mesSel !== 'todos' && (
          <div style={{ display: 'flex', gap: 6 }}>
            {fechAntecip && (
              <button onClick={() => removerFechamento(fechAntecip.id)} style={{ padding: '0.4rem 0.75rem', border: '1px solid #fca5a5', borderRadius: 8, background: '#fef2f2', fontSize: 12, color: '#dc2626', cursor: 'pointer', fontFamily: 'inherit' }}>
                ✕ Antecipação
              </button>
            )}
            {fechFolha && (
              <button onClick={() => removerFechamento(fechFolha.id)} style={{ padding: '0.4rem 0.75rem', border: '1px solid #fca5a5', borderRadius: 8, background: '#fef2f2', fontSize: 12, color: '#dc2626', cursor: 'pointer', fontFamily: 'inherit' }}>
                ✕ Folha
              </button>
            )}
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
          {(['antecipacao', 'folha', 'total'] as const).map(t => (
            <button key={t} onClick={() => setTipoVis(t)} style={{
              padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none',
              background: tipoVis === t ? 'var(--navy)' : 'transparent',
              color: tipoVis === t ? 'white' : 'var(--text-2)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {t === 'antecipacao' ? 'Antecipação' : t === 'folha' ? 'Folha' : 'Total'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cards ── */}
      <div className="cards-grid">
        <div className="card" style={{ background: 'var(--navy)', border: 'none' }}>
          <div className="card-label" style={{ color: 'rgba(255,255,255,0.6)' }}>
            {mesSel === 'todos' ? 'Total geral (todos os meses)' : `Total — ${labelMesAno(mesSel)}`}
          </div>
          <div className="card-valor" style={{ fontSize: 18, color: 'white' }}>{fmt(totalGeral || totalAntecipacao + totalFolha)}</div>
          <div className="card-sub" style={{ color: 'rgba(255,255,255,0.5)' }}>{fechsFiltrados.length} fechamento{fechsFiltrados.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="card" style={{ borderColor: totalAntecipacao > 0 ? '#fcd34d' : undefined }}>
          <div className="card-label">Antecipações (40%)</div>
          <div className="card-valor" style={{ fontSize: 18, color: totalAntecipacao > 0 ? '#d97706' : 'var(--text-3)' }}>
            {totalAntecipacao > 0 ? fmt(totalAntecipacao) : '—'}
          </div>
          <div className="card-sub">pago dia 20</div>
        </div>
        <div className="card" style={{ borderColor: totalFolha > 0 ? '#86efac' : undefined }}>
          <div className="card-label">Folhas (60%+)</div>
          <div className="card-valor" style={{ fontSize: 18, color: totalFolha > 0 ? '#16a34a' : 'var(--text-3)' }}>
            {totalFolha > 0 ? fmt(totalFolha) : '—'}
          </div>
          <div className="card-sub">pago dia 10</div>
        </div>
        <div className="card">
          <div className="card-label">Cidades</div>
          <div className="card-valor">{dadosPorCidade.length}</div>
          <div className="card-sub">com lançamentos</div>
        </div>
      </div>

      {/* ── Gráfico de evolução mensal ── */}
      {evolucaoMensal.length > 1 && (
        <div className="grafico-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div className="grafico-titulo" style={{ margin: 0 }}>Evolução mensal</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Clique em um mês para filtrar</div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={evolucaoMensal}
              margin={{ top: 28, right: 20, left: 10, bottom: 5 }}
              barCategoryGap="20%"
              onClick={d => d?.activeLabel && setMesSel(
                evolucaoMensal.find(m => m.label === d.activeLabel)?.mes || 'todos'
              )}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 600 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} width={60} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="antecipacao" name="Antecipação" stackId="a" fill="#f59e0b">
                <LabelList content={<LabelMensalAntecip />} />
              </Bar>
              <Bar dataKey="folha" name="Folha" stackId="a" fill="#2D3A6B" radius={[3, 3, 0, 0]}>
                <LabelList content={<LabelMensalFolha />} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
            🟡 Antecipação &nbsp;&nbsp; 🔵 Folha
          </div>
        </div>
      )}

      {/* ── Gráfico por cidade ── */}
      {dadosPorCidade.length > 0 && (
        <div className="grafico-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div className="grafico-titulo" style={{ margin: 0 }}>
              {tipoVis === 'antecipacao' ? 'Antecipação' : tipoVis === 'folha' ? 'Folha' : 'Total pago'} por cidade
              {mesSel !== 'todos' && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-2)', marginLeft: 8 }}>— {labelMesAno(mesSel)}</span>}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(280, dadosPorCidade.length * 46)}>
            <BarChart data={dadosPorCidade} layout="vertical" margin={{ top: 0, right: 100, left: 8, bottom: 0 }} barSize={26}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="cidade" tick={{ fontSize: 12, fontWeight: 500 }} width={195} />
              <Tooltip content={<CustomTooltip />} />
              {tipoVis === 'total' ? (
                <>
                  <Bar dataKey="antecipacao" name="Antecipação" stackId="cidade" fill="#f59e0b">
                    <LabelList content={<LabelCidadeAntecip />} />
                  </Bar>
                  <Bar dataKey="folha" name="Folha" stackId="cidade" radius={[0, 4, 4, 0]}>
                    {dadosPorCidade.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                    <LabelList content={<LabelCidadeFolha />} />
                  </Bar>
                </>
              ) : (
                <Bar
                  dataKey={tipoVis}
                  name={tipoVis === 'antecipacao' ? 'Antecipação' : 'Folha'}
                  radius={[0, 4, 4, 0]}
                  fill={tipoVis === 'antecipacao' ? '#f59e0b' : '#2D3A6B'}
                >
                  <LabelList content={<LabelSimples />} />
                </Bar>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Tabela detalhada por cidade ── */}
      {dadosPorCidade.length > 0 && (
        <div className="tabela-hist-wrap">
          <div className="grafico-titulo">
            Detalhamento por cidade
            {mesSel !== 'todos' && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-2)', marginLeft: 8 }}>— {labelMesAno(mesSel)}</span>}
          </div>
          <table className="tabela tabela-sm">
            <thead>
              <tr>
                <th>Cidade</th>
                <th style={{ textAlign: 'right' }}>Antecipação</th>
                <th style={{ textAlign: 'right' }}>Folha</th>
                <th style={{ textAlign: 'right', color: 'var(--navy)' }}>Total</th>
                <th style={{ textAlign: 'right' }}>% do total</th>
              </tr>
            </thead>
            <tbody>
              {dadosPorCidade.map((d, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: CORES[i % CORES.length], display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontWeight: 600 }}>{d.cidade}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', color: '#d97706' }}>{d.antecipacao > 0 ? fmt(d.antecipacao) : '—'}</td>
                  <td style={{ textAlign: 'right', color: '#16a34a' }}>{d.folha > 0 ? fmt(d.folha) : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--navy)' }}>{fmt(d.total)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-2)', fontSize: 12 }}>
                    {totalGeral > 0 ? ((d.total / (totalGeral || totalAntecipacao + totalFolha)) * 100).toFixed(1) + '%' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--sky-light)' }}>
                <td style={{ fontWeight: 700 }}>TOTAL</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#d97706' }}>{fmt(totalAntecipacao)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{fmt(totalFolha)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--navy)' }}>{fmt(totalAntecipacao + totalFolha)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Lista de fechamentos ── */}
      <div className="tabela-hist-wrap">
        <div className="grafico-titulo">Fechamentos importados</div>
        <table className="tabela tabela-sm">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Competência</th>
              <th>Arquivo</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th>Importado em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {fechamentos.map((f, i) => (
              <tr key={i} style={{ background: mesSel === f.mesAno ? 'var(--sky-light)' : undefined }}>
                <td>
                  <span style={{
                    fontSize: 11, fontWeight: 600, borderRadius: 10, padding: '2px 8px',
                    background: f.tipo === 'antecipacao' ? '#fffbeb' : '#f0fdf4',
                    color: f.tipo === 'antecipacao' ? '#d97706' : '#16a34a',
                    border: `1px solid ${f.tipo === 'antecipacao' ? '#fde68a' : '#86efac'}`,
                  }}>
                    {f.tipo === 'antecipacao' ? '📅 Antecipação' : '💰 Folha'}
                  </span>
                </td>
                <td style={{ fontWeight: 600 }}>
                  <button onClick={() => setMesSel(mesSel === f.mesAno ? 'todos' : f.mesAno)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: 'var(--navy)', fontFamily: 'inherit', fontSize: 13, padding: 0 }}>
                    {labelMesAno(f.mesAno)}
                  </button>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-2)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.arquivo}</td>
                <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(f.totalGeral)}</td>
                <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{new Date(f.dataImport).toLocaleDateString('pt-BR')}</td>
                <td>
                  <button onClick={() => removerFechamento(f.id)} style={{ padding: '3px 8px', fontSize: 11, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit' }}>Remover</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
