'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'

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
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${nomes[parseInt(mes) - 1]}/${ano.slice(2)}`
}

const CORES = ['#2D3A6B','#4AABDB','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#14b8a6','#6366f1','#a855f7','#fb7185']

export default function ResumoDPGeral() {
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [fechamentoSel, setFechamentoSel] = useState<string>('todos')
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
    if (!confirm('Remover este fechamento de folha?')) return
    await fetch('/api/dp/fechamentos', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await carregar()
  }

  // Fechamentos filtrados pelo seletor
  const fechamentosFiltrados = useMemo(() => {
    if (fechamentoSel === 'todos') return fechamentos
    return fechamentos.filter(f => f.id === fechamentoSel)
  }, [fechamentos, fechamentoSel])

  // Agrega por cidade
  const dadosPorCidade = useMemo(() => {
    const mapa: Record<string, { antecipacao: number; folha: number; total: number }> = {}
    for (const f of fechamentosFiltrados) {
      for (const [cidade, valor] of Object.entries(f.totalPorCidade)) {
        if (!mapa[cidade]) mapa[cidade] = { antecipacao: 0, folha: 0, total: 0 }
        if (f.tipo === 'antecipacao') mapa[cidade].antecipacao += valor
        else mapa[cidade].folha += valor
        mapa[cidade].total += valor
      }
    }
    return Object.entries(mapa)
      .map(([cidade, vals]) => ({ cidade, ...vals }))
      .filter(d => d.total > 0)
      .sort((a, b) => b.total - a.total)
  }, [fechamentosFiltrados])

  // Evolução mensal
  const evolucaoMensal = useMemo(() => {
    const meses = Array.from(new Set(fechamentos.map(f => f.mesAno))).sort()
    return meses.map(mes => {
      const fsMes = fechamentos.filter(f => f.mesAno === mes)
      const antecipacao = fsMes.filter(f => f.tipo === 'antecipacao').reduce((s, f) => s + f.totalGeral, 0)
      const folha = fsMes.filter(f => f.tipo === 'folha').reduce((s, f) => s + f.totalGeral, 0)
      return { label: labelMesAno(mes), mes, antecipacao, folha, total: antecipacao + folha }
    })
  }, [fechamentos])

  // Totais do período selecionado
  const totalAntecipacao = fechamentosFiltrados.filter(f => f.tipo === 'antecipacao').reduce((s, f) => s + f.totalGeral, 0)
  const totalFolha = fechamentosFiltrados.filter(f => f.tipo === 'folha').reduce((s, f) => s + f.totalGeral, 0)
  const totalGeral = totalAntecipacao + totalFolha

  const valorExibido = (d: any) => {
    if (tipoVis === 'antecipacao') return d.antecipacao
    if (tipoVis === 'folha') return d.folha
    return d.total
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <div style={{ fontWeight: 700, color: '#2D3A6B', marginBottom: 6 }}>{label}</div>
        {payload.map((p: any, i: number) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: p.fill || p.color, display: 'inline-block', marginTop: 2, flexShrink: 0 }} />
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

      {/* ── Seletor de fechamento (igual ao de extratos do combustível) ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.75rem 1rem', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', boxShadow: 'var(--shadow-sm)' }}>
        <label className="filtro-label">Fechamento:</label>
        <select
          className="filtro-select"
          value={fechamentoSel}
          onChange={e => setFechamentoSel(e.target.value)}
          style={{ minWidth: 340 }}
        >
          <option value="todos">Todos os fechamentos</option>
          {fechamentos.map(f => (
            <option key={f.id} value={f.id}>
              {f.tipo === 'antecipacao' ? '📅 Antecipação' : '💰 Folha'} — {labelMesAno(f.mesAno)} — {fmt(f.totalGeral)} ({new Date(f.dataImport).toLocaleDateString('pt-BR')})
            </option>
          ))}
        </select>

        {fechamentoSel !== 'todos' && (
          <button
            onClick={() => removerFechamento(fechamentoSel)}
            style={{ padding: '0.45rem 0.875rem', border: '1px solid #fca5a5', borderRadius: 8, background: '#fef2f2', fontSize: 13, color: '#dc2626', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
          >Remover fechamento</button>
        )}

        {/* Toggle tipo */}
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

      {/* ── Cards resumo ── */}
      <div className="cards-grid">
        <div className="card">
          <div className="card-label">Total geral</div>
          <div className="card-valor" style={{ fontSize: 18 }}>{fmt(totalGeral)}</div>
          <div className="card-sub">{fechamentosFiltrados.length} fechamento{fechamentosFiltrados.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="card" style={{ borderColor: '#fcd34d' }}>
          <div className="card-label">Antecipações (40%)</div>
          <div className="card-valor" style={{ fontSize: 18, color: '#d97706' }}>{fmt(totalAntecipacao)}</div>
          <div className="card-sub">pago dia 20</div>
        </div>
        <div className="card card-ok">
          <div className="card-label">Folhas (60%+)</div>
          <div className="card-valor" style={{ fontSize: 18, color: '#16a34a' }}>{fmt(totalFolha)}</div>
          <div className="card-sub">pago dia 10</div>
        </div>
        <div className="card">
          <div className="card-label">Cidades</div>
          <div className="card-valor">{dadosPorCidade.length}</div>
          <div className="card-sub">com lançamentos</div>
        </div>
      </div>

      {/* ── Gráfico de barras horizontais por cidade ── */}
      {dadosPorCidade.length > 0 && (
        <div className="grafico-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div className="grafico-titulo" style={{ margin: 0 }}>
              {tipoVis === 'antecipacao' ? 'Antecipação' : tipoVis === 'folha' ? 'Folha' : 'Total pago'} por cidade
            </div>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(280, dadosPorCidade.length * 46)}>
            <BarChart data={dadosPorCidade} layout="vertical" margin={{ top: 0, right: 80, left: 8, bottom: 0 }} barSize={26}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="cidade" tick={{ fontSize: 12, fontWeight: 500 }} width={190} />
              <Tooltip content={<CustomTooltip />} />
              <Bar
                dataKey={tipoVis}
                name={tipoVis === 'antecipacao' ? 'Antecipação' : tipoVis === 'folha' ? 'Folha' : 'Total'}
                radius={[0, 4, 4, 0]}
                label={{ position: 'right', fontSize: 11, fontWeight: 600, formatter: (v: number) => fmtK(v) }}
              >
                {dadosPorCidade.map((_, i) => (
                  <Cell key={i} fill={CORES[i % CORES.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Evolução mensal (quando "todos") ── */}
      {fechamentoSel === 'todos' && evolucaoMensal.length > 1 && (
        <div className="grafico-card">
          <div className="grafico-titulo" style={{ marginBottom: '1rem' }}>Evolução mensal</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={evolucaoMensal} margin={{ top: 5, right: 20, left: 10, bottom: 5 }} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 600 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtK} width={65} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="antecipacao" name="Antecipação" stackId="a" fill="#f59e0b" />
              <Bar dataKey="folha" name="Folha" stackId="a" fill="#2D3A6B" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Tabela detalhada por cidade ── */}
      {dadosPorCidade.length > 0 && (
        <div className="tabela-hist-wrap">
          <div className="grafico-titulo">Detalhamento por cidade</div>
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
                    {totalGeral > 0 ? ((d.total / totalGeral) * 100).toFixed(1) + '%' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--sky-light)' }}>
                <td style={{ fontWeight: 700 }}>TOTAL</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#d97706' }}>{fmt(totalAntecipacao)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{fmt(totalFolha)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--navy)' }}>{fmt(totalGeral)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Lista de fechamentos importados ── */}
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
              <tr key={i}>
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
                <td style={{ fontWeight: 600 }}>{labelMesAno(f.mesAno)}</td>
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
