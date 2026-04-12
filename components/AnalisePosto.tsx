'use client'
import { useState, useMemo } from 'react'
import { Extrato } from '@/lib/types'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtL = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L'

function parsarDataBR(data: string): Date | null {
  const m = data.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return null
  let ano = parseInt(m[3])
  if (ano < 100) ano += ano < 50 ? 2000 : 1900
  return new Date(ano, parseInt(m[2]) - 1, parseInt(m[1]))
}

function labelPeriodo(extratoId: string, lancamentos: any[], tipo: 'mes' | 'quinzena'): string {
  const datas = lancamentos.map(l => parsarDataBR(l.emissao)).filter(Boolean) as Date[]
  if (datas.length === 0) return extratoId.substring(0, 8)
  const menor = new Date(Math.min(...datas.map(d => d.getTime())))
  const maior = new Date(Math.max(...datas.map(d => d.getTime())))
  const fmtD = (d: Date) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
  if (tipo === 'quinzena') return `${fmtD(menor)} a ${fmtD(maior)}/${menor.getFullYear().toString().slice(2)}`
  return menor.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}

export default function AnalisePosto({ extratos }: { extratos: Extrato[] }) {
  const [postoSel, setPostoSel] = useState('')
  const [tipo, setTipo] = useState<'mes' | 'quinzena'>('quinzena')
  const [metrica, setMetrica] = useState<'valor' | 'litros' | 'preco'>('valor')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  // Listar postos únicos
  const postos = useMemo(() => {
    const nomes = new Set<string>()
    extratos.forEach(e => e.postos.forEach(p => nomes.add(p.nome)))
    return Array.from(nomes).sort()
  }, [extratos])

  // Dados do posto selecionado por período
  const periodos = useMemo(() => {
    if (!postoSel) return []

    const extratosOrdenados = [...extratos].sort((a, b) => {
      const la = a.postos.flatMap(p => p.lancamentos)
      const lb = b.postos.flatMap(p => p.lancamentos)
      const da = la.map(l => parsarDataBR(l.emissao)).filter(Boolean) as Date[]
      const db = lb.map(l => parsarDataBR(l.emissao)).filter(Boolean) as Date[]
      if (!da.length || !db.length) return 0
      return Math.min(...da.map(d => d.getTime())) - Math.min(...db.map(d => d.getTime()))
    })

    return extratosOrdenados.flatMap(e => {
      const posto = e.postos.find(p => p.nome === postoSel)
      if (!posto) return []

      const lancamentos = posto.lancamentos.filter(l => {
        if (!dataInicio && !dataFim) return true
        const d = parsarDataBR(l.emissao)
        if (!d) return true
        if (dataInicio && d < new Date(dataInicio)) return false
        if (dataFim && d > new Date(dataFim + 'T23:59:59')) return false
        return true
      })
      const label = labelPeriodo(e.id, lancamentos, tipo)

      const totalValor = lancamentos.reduce((s, l) => s + l.valor, 0)
      const totalLitros = lancamentos.reduce((s, l) => s + l.litros, 0)
      const precoMedio = totalLitros > 0 ? totalValor / totalLitros : 0
      const nVeiculos = new Set(lancamentos.map(l => l.placaLida)).size

      const porCombustivel: Record<string, { valor: number; litros: number }> = {}
      lancamentos.forEach(l => {
        if (!porCombustivel[l.combustivelNome]) porCombustivel[l.combustivelNome] = { valor: 0, litros: 0 }
        porCombustivel[l.combustivelNome].valor += l.valor
        porCombustivel[l.combustivelNome].litros += l.litros
      })

      return [{
        label,
        extratoId: e.id,
        totalValor: parseFloat(totalValor.toFixed(2)),
        totalLitros: parseFloat(totalLitros.toFixed(1)),
        precoMedio: parseFloat(precoMedio.toFixed(3)),
        nVeiculos,
        porCombustivel,
        lancamentos,
      }]
    })
  }, [extratos, postoSel, tipo, dataInicio, dataFim])

  const combustiveisUnicos = useMemo(() => {
    const set = new Set<string>()
    periodos.forEach(p => Object.keys(p.porCombustivel).forEach(c => set.add(c)))
    return Array.from(set)
  }, [periodos])

  const CORES = ['#2D3A6B', '#4AABDB', '#16a34a', '#d97706', '#9333ea', '#dc2626']

  const dataGrafico = periodos.map(p => {
    const entry: Record<string, any> = {
      label: p.label,
      'Total R$': p.totalValor,
      'Litros': p.totalLitros,
      'R$/L': p.precoMedio,
    }
    combustiveisUnicos.forEach(c => {
      entry[`${c} (R$)`] = parseFloat((p.porCombustivel[c]?.valor || 0).toFixed(2))
      entry[`${c} (L)`] = parseFloat((p.porCombustivel[c]?.litros || 0).toFixed(1))
    })
    return entry
  })

  const variacoes = periodos.map((p, i) => {
    if (i === 0) return { ...p, varValor: null, varLitros: null, varPreco: null }
    const ant = periodos[i - 1]
    return {
      ...p,
      varValor: ant.totalValor > 0 ? ((p.totalValor - ant.totalValor) / ant.totalValor) * 100 : null,
      varLitros: ant.totalLitros > 0 ? ((p.totalLitros - ant.totalLitros) / ant.totalLitros) * 100 : null,
      varPreco: ant.precoMedio > 0 ? ((p.precoMedio - ant.precoMedio) / ant.precoMedio) * 100 : null,
    }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Filtros */}
      <div className="filtros-veiculo">
        <div className="filtro-grupo">
          <label className="filtro-label">Posto</label>
          <select className="filtro-select-lg" value={postoSel} onChange={e => setPostoSel(e.target.value)}>
            <option value="">Selecione um posto...</option>
            {postos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="filtro-grupo">
          <label className="filtro-label">Agrupamento</label>
          <select className="filtro-select-lg" style={{ minWidth: 160 }} value={tipo} onChange={e => setTipo(e.target.value as any)}>
            <option value="quinzena">Por quinzena / extrato</option>
            <option value="mes">Por mês</option>
          </select>
        </div>
        <div className="filtro-grupo">
          <label className="filtro-label">De</label>
          <input type="date" className="filtro-date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
        </div>
        <div className="filtro-grupo">
          <label className="filtro-label">Até</label>
          <input type="date" className="filtro-date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
        </div>
        {(dataInicio || dataFim) && (
          <button className="btn-limpar" onClick={() => { setDataInicio(''); setDataFim('') }}>
            Limpar período
          </button>
        )}
        <div className="filtro-grupo">
          <label className="filtro-label">Métrica do gráfico</label>
          <select className="filtro-select-lg" style={{ minWidth: 160 }} value={metrica} onChange={e => setMetrica(e.target.value as any)}>
            <option value="valor">Valor total (R$)</option>
            <option value="litros">Litros</option>
            <option value="preco">Preço médio/litro</option>
          </select>
        </div>
      </div>

      {!postoSel && (
        <div className="estado-vazio">
          <div className="estado-icone">↑</div>
          <div className="estado-titulo">Selecione um posto</div>
          <div className="estado-desc">Escolha o posto para ver a evolução período a período</div>
        </div>
      )}

      {postoSel && periodos.length === 0 && (
        <div className="estado-vazio">
          <div className="estado-titulo">Nenhum dado encontrado</div>
          <div className="estado-desc">Não há extratos deste posto no histórico</div>
        </div>
      )}

      {postoSel && periodos.length > 0 && (
        <>
          {/* Cards resumo */}
          <div className="cards-grid">
            <div className="card">
              <div className="card-label">Períodos registrados</div>
              <div className="card-valor">{periodos.length}</div>
            </div>
            <div className="card">
              <div className="card-label">Total acumulado</div>
              <div className="card-valor">{fmt(periodos.reduce((s, p) => s + p.totalValor, 0))}</div>
            </div>
            <div className="card">
              <div className="card-label">Total litros</div>
              <div className="card-valor">{fmtL(periodos.reduce((s, p) => s + p.totalLitros, 0))}</div>
            </div>
            <div className="card">
              <div className="card-label">Preço médio geral</div>
              <div className="card-valor">
                {(() => {
                  const tV = periodos.reduce((s, p) => s + p.totalValor, 0)
                  const tL = periodos.reduce((s, p) => s + p.totalLitros, 0)
                  return tL > 0 ? `R$ ${(tV/tL).toFixed(3)}/L` : '—'
                })()}
              </div>
            </div>
          </div>

          {/* Gráfico de evolução */}
          <div className="grafico-card">
            <div className="grafico-titulo">
              Evolução — {metrica === 'valor' ? 'Valor total (R$)' : metrica === 'litros' ? 'Litros' : 'Preço médio por litro'}
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dataGrafico} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e6f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }}
                  tickFormatter={v => metrica === 'valor' ? `R$${(v/1000).toFixed(0)}k` : metrica === 'preco' ? `R$${v.toFixed(2)}` : `${v.toFixed(0)}L`}
                />
                <Tooltip formatter={(v: number) => metrica === 'valor' ? fmt(v) : metrica === 'preco' ? `R$ ${v.toFixed(3)}/L` : fmtL(v)} />
                <Bar dataKey={metrica === 'valor' ? 'Total R$' : metrica === 'litros' ? 'Litros' : 'R$/L'}
                  fill="#2D3A6B" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Gráfico por combustível */}
          {combustiveisUnicos.length > 1 && (
            <div className="grafico-card">
              <div className="grafico-titulo">Evolução por combustível (R$)</div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={dataGrafico} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e6f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend />
                  {combustiveisUnicos.map((c, i) => (
                    <Line key={c} type="monotone" dataKey={`${c} (R$)`} name={c}
                      stroke={CORES[i % CORES.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabela comparativa período a período */}
          <div className="tabela-hist-wrap">
            <div className="grafico-titulo">Comparativo período a período</div>
            <table className="tabela tabela-sm">
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Veículos</th>
                  <th>Litros</th>
                  <th>Valor total</th>
                  <th>Preço médio/L</th>
                  <th>Var. valor</th>
                  <th>Var. litros</th>
                  <th>Var. preço</th>
                </tr>
              </thead>
              <tbody>
                {variacoes.map((p, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{p.label}</td>
                    <td>{p.nVeiculos}</td>
                    <td>{fmtL(p.totalLitros)}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(p.totalValor)}</td>
                    <td>R$ {p.precoMedio.toFixed(3)}</td>
                    <td>{p.varValor !== null ? (
                      <span className={`badge-diff ${p.varValor > 5 ? 'badge-vermelho' : p.varValor < -5 ? 'badge-verde' : 'badge-neutro'}`}>
                        {p.varValor > 0 ? '+' : ''}{p.varValor.toFixed(1)}%
                      </span>
                    ) : '—'}</td>
                    <td>{p.varLitros !== null ? (
                      <span className={`badge-diff ${p.varLitros > 10 ? 'badge-vermelho' : p.varLitros < -10 ? 'badge-verde' : 'badge-neutro'}`}>
                        {p.varLitros > 0 ? '+' : ''}{p.varLitros.toFixed(1)}%
                      </span>
                    ) : '—'}</td>
                    <td>{p.varPreco !== null ? (
                      <span className={`badge-diff ${p.varPreco > 3 ? 'badge-vermelho' : p.varPreco < -3 ? 'badge-verde' : 'badge-neutro'}`}>
                        {p.varPreco > 0 ? '+' : ''}{p.varPreco.toFixed(1)}%
                      </span>
                    ) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Detalhamento por combustível por período */}
          <div className="tabela-hist-wrap">
            <div className="grafico-titulo">Detalhamento por combustível por período</div>
            <table className="tabela tabela-sm">
              <thead>
                <tr>
                  <th>Período</th>
                  {combustiveisUnicos.map(c => (
                    <th key={c} colSpan={2} style={{ textAlign: 'center' }}>{c}</th>
                  ))}
                </tr>
                <tr>
                  <th></th>
                  {combustiveisUnicos.map(c => (
                    <>
                      <th key={`${c}-v`} style={{ color: 'var(--text-3)', fontSize: 10 }}>R$</th>
                      <th key={`${c}-l`} style={{ color: 'var(--text-3)', fontSize: 10 }}>Litros</th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periodos.map((p, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{p.label}</td>
                    {combustiveisUnicos.map(c => (
                      <>
                        <td key={`${c}-v`}>{p.porCombustivel[c] ? fmt(p.porCombustivel[c].valor) : '—'}</td>
                        <td key={`${c}-l`}>{p.porCombustivel[c] ? fmtL(p.porCombustivel[c].litros) : '—'}</td>
                      </>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
