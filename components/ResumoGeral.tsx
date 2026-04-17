'use client'
import { useState, useMemo } from 'react'
import { Lancamento, Extrato } from '@/lib/types'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtL = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L'
const fmtK = (v: number) => v >= 1000 ? `R$${(v/1000).toFixed(1)}k` : fmt(v)

const CORES_COMB  = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2']
const CORES_POSTO = ['#2D3A6B', '#4AABDB', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4']

function parsarDataBR(data: string): Date | null {
  const m = data.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return null
  let ano = parseInt(m[3])
  if (ano < 100) ano += ano < 50 ? 2000 : 1900
  return new Date(ano, parseInt(m[2]) - 1, parseInt(m[1]))
}

function mesAnoKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
}
function labelMes(key: string) {
  const [ano, mes] = key.split('-')
  const n = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${n[parseInt(mes)-1]}/${ano.slice(2)}`
}

interface Props {
  totalValor: number
  totalLitros: number
  totalVeiculos: number
  alertas: { confirmadaValor: number; provalValor: number; naoIdentificadaValor: number; confirmada: number; provavel: number; naoIdentificada: number }
  lancamentos: Lancamento[]
  extratos: Extrato[]
}

export default function ResumoGeral({ totalValor, totalLitros, totalVeiculos, alertas, lancamentos, extratos }: Props) {
  const [metrica, setMetrica] = useState<'valor' | 'litros'>('valor')
  const [mesSel, setMesSel] = useState<string>('')
  // Novo: postos selecionados no gráfico de evolução
  const [postosSel, setPostosSel] = useState<string[]>([])

  // Combustível
  const porCombustivel: Record<string, { valor: number; litros: number }> = {}
  lancamentos.forEach(l => {
    if (!porCombustivel[l.combustivelNome]) porCombustivel[l.combustivelNome] = { valor: 0, litros: 0 }
    porCombustivel[l.combustivelNome].valor += l.valor
    porCombustivel[l.combustivelNome].litros += l.litros
  })
  const dataComb = Object.entries(porCombustivel).map(([nome, d]) => ({ nome, ...d }))
  const totalAlerta = alertas.naoIdentificadaValor

  // Postos únicos
  const postos = useMemo(() => {
    const s = new Set<string>()
    extratos.forEach(e => e.postos.forEach(p => s.add(p.nome)))
    return Array.from(s).sort()
  }, [extratos])

  // Dados mensais por posto
  const dadosMensais = useMemo(() => {
    const mapa: Record<string, Record<string, { valor: number; litros: number }>> = {}
    extratos.forEach(e => e.postos.forEach(posto => {
      posto.lancamentos.forEach(l => {
        const d = parsarDataBR(l.emissao)
        if (!d) return
        const key = mesAnoKey(d)
        if (!mapa[key]) mapa[key] = {}
        if (!mapa[key][posto.nome]) mapa[key][posto.nome] = { valor: 0, litros: 0 }
        mapa[key][posto.nome].valor += l.valor
        mapa[key][posto.nome].litros += l.litros
      })
    }))
    return Object.entries(mapa)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, pd]) => ({
        key, label: labelMes(key),
        total: Object.values(pd).reduce((s, v) => s + v.valor, 0),
        totalLitros: Object.values(pd).reduce((s, v) => s + v.litros, 0),
        postos: pd,
        ...Object.fromEntries(postos.map(nome => [
          nome,
          metrica === 'valor'
            ? parseFloat((pd[nome]?.valor || 0).toFixed(2))
            : parseFloat((pd[nome]?.litros || 0).toFixed(1))
        ]))
      }))
  }, [extratos, postos, metrica])

  const meses = dadosMensais.map(d => d.key)
  const mesSelecionado = mesSel || meses[meses.length - 1] || ''
  const dadosMesSel = dadosMensais.find(d => d.key === mesSelecionado)

  // Dados do mês selecionado para barras horizontais
  const dadosPostosMes = useMemo(() => {
    if (!dadosMesSel) return []
    return postos
      .map(nome => ({
        nome: nome.length > 28 ? nome.slice(0, 28) + '…' : nome,
        nomeCompleto: nome,
        valor: parseFloat((dadosMesSel.postos[nome]?.valor || 0).toFixed(2)),
        litros: parseFloat((dadosMesSel.postos[nome]?.litros || 0).toFixed(1)),
      }))
      .filter(p => (metrica === 'valor' ? p.valor : p.litros) > 0)
      .sort((a, b) => (metrica === 'valor' ? b.valor - a.valor : b.litros - a.litros))
  }, [dadosMesSel, postos, metrica])

  // Postos ativos no gráfico de evolução (inicializa com todos se vazio)
  const postosAtivos = useMemo(() => {
    if (postosSel.length > 0) return postosSel
    return postos
  }, [postosSel, postos])

  // Dados do gráfico de evolução por posto selecionado
  const dadosEvolucao = useMemo(() => {
    return dadosMensais.map(m => {
      const entry: Record<string, any> = { label: m.label, key: m.key }
      postosAtivos.forEach(nome => {
        entry[nome] = metrica === 'valor'
          ? parseFloat((m.postos[nome]?.valor || 0).toFixed(2))
          : parseFloat((m.postos[nome]?.litros || 0).toFixed(1))
      })
      return entry
    })
  }, [dadosMensais, postosAtivos, metrica])

  const togglePosto = (nome: string) => {
    setPostosSel(prev => {
      // Se nenhum selecionado explicitamente, começa do zero selecionando só este
      const base = prev.length === 0 ? postos : prev
      if (base.includes(nome)) {
        const next = base.filter(p => p !== nome)
        return next.length === 0 ? postos : next // não deixa vazio
      }
      return [...base, nome]
    })
  }

  const selecionarTodos = () => setPostosSel([])
  const limparSelecao = (nome: string) => setPostosSel([nome])

  const mediaGeral = dadosMensais.length > 0
    ? dadosMensais.reduce((s, m) => s + m.total, 0) / dadosMensais.length : 0

  const CustomTooltipMensal = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0)
    return (
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <div style={{ fontWeight: 700, color: '#2D3A6B', marginBottom: 8, fontSize: 13 }}>{label}</div>
        {payload.map((p: any, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: p.fill, flexShrink: 0 }} />
            <span style={{ color: '#6b7280', flex: 1 }}>{p.name.length > 28 ? p.name.slice(0, 28) + '…' : p.name}</span>
            <span style={{ fontWeight: 600 }}>{metrica === 'valor' ? fmt(p.value) : fmtL(p.value)}</span>
          </div>
        ))}
        <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>Total</span>
          <span style={{ color: '#2D3A6B' }}>{metrica === 'valor' ? fmt(total) : fmtL(total)}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="resumo">

      {/* ── Cards ── */}
      <div className="cards-grid">
        <div className="card">
          <div className="card-label">Total gasto</div>
          <div className="card-valor">{fmt(totalValor)}</div>
        </div>
        <div className="card">
          <div className="card-label">Total litros</div>
          <div className="card-valor">{fmtL(totalLitros)}</div>
        </div>
        <div className="card">
          <div className="card-label">Média mensal</div>
          <div className="card-valor" style={{ fontSize: 18 }}>{fmt(mediaGeral)}</div>
        </div>
        <div className={`card ${totalAlerta > 0 ? 'card-alerta' : 'card-ok'}`}>
          <div className="card-label">Placas a investigar</div>
          <div className="card-valor">{fmt(totalAlerta)}</div>
          <div className="card-sub">{alertas.naoIdentificada} não identificada{alertas.naoIdentificada !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* ── Gráfico 1: empilhado mensal por posto ── */}
      {dadosMensais.length > 0 && (
        <div className="grafico-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div className="grafico-titulo" style={{ margin: 0 }}>Gasto mensal por posto</div>
              {dadosMensais.length === 1 && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>Apenas 1 mês — o gráfico crescerá conforme novos extratos forem lançados</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 4 }}>
              {(['valor', 'litros'] as const).map(op => (
                <button key={op} onClick={() => setMetrica(op)} style={{
                  padding: '4px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none',
                  background: metrica === op ? 'var(--navy)' : 'transparent',
                  color: metrica === op ? 'white' : 'var(--text-2)',
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                }}>{op === 'valor' ? 'Valor R$' : 'Litros'}</button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dadosMensais} margin={{ top: 5, right: 20, left: 10, bottom: 5 }} barCategoryGap="25%"
              onClick={d => {
                if (d?.activeLabel) {
                  const found = dadosMensais.find(m => m.label === d.activeLabel)
                  if (found) setMesSel(found.key)
                }
              }}
              style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 600 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => metrica === 'valor' ? fmtK(v) : `${(v/1000).toFixed(1)}kL`} width={60} />
              <Tooltip content={<CustomTooltipMensal />} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={n => n.length > 25 ? n.slice(0, 25) + '…' : n} />
              {postos.map((nome, i) => (
                <Bar key={nome} dataKey={nome} name={nome} stackId="a" fill={CORES_POSTO[i % CORES_POSTO.length]}
                  radius={i === postos.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          {dadosMensais.length > 1 && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, textAlign: 'center' }}>
              Clique em um mês para detalhar os postos abaixo
            </div>
          )}
        </div>
      )}

      {/* ── Gráfico 2: barras horizontais — postos no mês selecionado ── */}
      {dadosMesSel && dadosPostosMes.length > 0 && (
        <div className="grafico-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '1rem' }}>
            <div>
              <div className="grafico-titulo" style={{ margin: 0 }}>Postos em {labelMes(mesSelecionado)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                Total: <strong style={{ color: 'var(--navy)' }}>
                  {metrica === 'valor' ? fmt(dadosMesSel.total) : fmtL(dadosMesSel.totalLitros)}
                </strong>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {meses.map(m => (
                <button key={m} onClick={() => setMesSel(m)} style={{
                  padding: '4px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                  border: `1.5px solid ${mesSelecionado === m ? 'var(--navy)' : 'var(--border)'}`,
                  background: mesSelecionado === m ? 'var(--sky-light)' : 'var(--bg)',
                  color: mesSelecionado === m ? 'var(--navy)' : 'var(--text-2)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{labelMes(m)}</button>
              ))}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={Math.max(220, dadosPostosMes.length * 52)}>
            <BarChart data={dadosPostosMes} layout="vertical" margin={{ top: 0, right: 70, left: 8, bottom: 0 }} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => metrica === 'valor' ? fmtK(v) : `${(v/1000).toFixed(1)}kL`} />
              <YAxis type="category" dataKey="nome" tick={{ fontSize: 12, fontWeight: 500 }} width={210} />
              <Tooltip
                formatter={(v: number) => [metrica === 'valor' ? fmt(v) : fmtL(v), metrica === 'valor' ? 'Valor' : 'Litros']}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey={metrica === 'valor' ? 'valor' : 'litros'} radius={[0, 4, 4, 0]}
                label={{ position: 'right', fontSize: 11, fontWeight: 600, formatter: (v: number) => metrica === 'valor' ? fmtK(v) : fmtL(v) }}>
                {dadosPostosMes.map((entry, i) => (
                  <Cell key={i} fill={CORES_POSTO[postos.indexOf(entry.nomeCompleto) % CORES_POSTO.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Gráfico 3: evolução mensal por posto selecionado ── */}
      {dadosMensais.length > 0 && postos.length > 0 && (
        <div className="grafico-card">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: '1rem' }}>
            <div>
              <div className="grafico-titulo" style={{ margin: 0 }}>Evolução mensal por posto</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                Selecione os postos para comparar mês a mês
              </div>
            </div>
          </div>

          {/* Seletor de postos — chips clicáveis */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '1.25rem' }}>
            <button
              onClick={selecionarTodos}
              style={{
                padding: '4px 12px', fontSize: 11, fontWeight: 700, borderRadius: 20,
                border: `1.5px solid ${postosSel.length === 0 ? 'var(--navy)' : 'var(--border)'}`,
                background: postosSel.length === 0 ? 'var(--navy)' : 'var(--bg)',
                color: postosSel.length === 0 ? 'white' : 'var(--text-2)',
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}
            >Todos</button>
            {postos.map((nome, i) => {
              const cor = CORES_POSTO[i % CORES_POSTO.length]
              const ativo = postosSel.length === 0 || postosSel.includes(nome)
              return (
                <button
                  key={nome}
                  onClick={() => togglePosto(nome)}
                  onDoubleClick={() => limparSelecao(nome)}
                  title={`Clique para alternar · Duplo clique para isolar`}
                  style={{
                    padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 20,
                    border: `1.5px solid ${ativo ? cor : 'var(--border)'}`,
                    background: ativo ? cor : 'var(--bg)',
                    color: ativo ? 'white' : 'var(--text-3)',
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                    opacity: ativo ? 1 : 0.5,
                  }}
                >
                  {nome.length > 22 ? nome.slice(0, 22) + '…' : nome}
                </button>
              )
            })}
          </div>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dadosEvolucao} margin={{ top: 5, right: 20, left: 10, bottom: 5 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 600 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => metrica === 'valor' ? fmtK(v) : `${(v/1000).toFixed(1)}kL`} width={60} />
              <Tooltip content={<CustomTooltipMensal />} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={n => n.length > 25 ? n.slice(0, 25) + '…' : n} />
              {postosAtivos.map((nome, i) => {
                const idxGlobal = postos.indexOf(nome)
                return (
                  <Bar
                    key={nome}
                    dataKey={nome}
                    name={nome}
                    stackId="b"
                    fill={CORES_POSTO[idxGlobal % CORES_POSTO.length]}
                    radius={i === postosAtivos.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                  />
                )
              })}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Tabela completa resumo mensal por posto ── */}
      {dadosMensais.length > 0 && (
        <div className="tabela-hist-wrap">
          <div className="grafico-titulo">Resumo mensal por posto</div>
          <table className="tabela tabela-sm">
            <thead>
              <tr>
                <th>Mês</th>
                {postos.map(p => (
                  <th key={p} style={{ textAlign: 'right' }}>{p.length > 22 ? p.slice(0, 22) + '…' : p}</th>
                ))}
                <th style={{ textAlign: 'right', color: 'var(--navy)' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {dadosMensais.map((m, i) => (
                <tr key={i} onClick={() => setMesSel(m.key)}
                  style={{ cursor: 'pointer', background: mesSelecionado === m.key ? 'var(--sky-light)' : undefined }}>
                  <td style={{ fontWeight: 600 }}>{m.label}</td>
                  {postos.map(p => (
                    <td key={p} style={{ textAlign: 'right', fontSize: 12 }}>
                      {(m as any)[p] > 0
                        ? (metrica === 'valor' ? fmt((m as any)[p]) : fmtL((m as any)[p]))
                        : '—'}
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--navy)' }}>
                    {metrica === 'valor' ? fmt(m.total) : fmtL(m.totalLitros)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--sky-light)' }}>
                <td style={{ fontWeight: 700 }}>TOTAL</td>
                {postos.map(nome => {
                  const t = extratos
                    .flatMap(e => e.postos)
                    .filter(p => p.nome === nome)
                    .reduce((s, p) => s + (metrica === 'valor' ? p.totalValor : p.totalLitros), 0)
                  return (
                    <td key={nome} style={{ textAlign: 'right', fontWeight: 700, fontSize: 12 }}>
                      {metrica === 'valor' ? fmt(t) : fmtL(t)}
                    </td>
                  )
                })}
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--navy)' }}>
                  {metrica === 'valor'
                    ? fmt(extratos.reduce((s, e) => s + e.totalValor, 0))
                    : fmtL(extratos.reduce((s, e) => s + e.totalLitros, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Gráficos combustível + tabela resumida ── */}
      <div className="graficos-grid">
        <div className="grafico-card">
          <div className="grafico-titulo">Consumo por combustível</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dataComb} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number, name: string) => [name === 'valor' ? fmt(v) : fmtL(v), name === 'valor' ? 'Valor' : 'Litros']} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="valor" name="Valor (R$)" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="litros" name="Litros" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grafico-card">
          <div className="grafico-titulo">Resumo mensal</div>
          <table className="tabela tabela-sm">
            <thead>
              <tr>
                <th>Mês</th>
                <th style={{ textAlign: 'right' }}>Total R$</th>
                <th style={{ textAlign: 'right' }}>Litros</th>
              </tr>
            </thead>
            <tbody>
              {dadosMensais.slice(-6).map((m, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{m.label}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(m.total)}</td>
                  <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-2)' }}>{fmtL(m.totalLitros)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Tabela detalhamento por combustível ── */}
      <div className="tabela-comb-wrap">
        <div className="grafico-titulo">Detalhamento por combustível</div>
        <table className="tabela">
          <thead>
            <tr><th>Combustível</th><th>Litros</th><th>Valor (R$)</th><th>% do total</th></tr>
          </thead>
          <tbody>
            {dataComb.map((d, i) => (
              <tr key={i}>
                <td><span className="badge-comb" style={{ background: CORES_COMB[i % CORES_COMB.length] }}>{d.nome}</span></td>
                <td>{fmtL(d.litros)}</td>
                <td>{fmt(d.valor)}</td>
                <td>{totalValor > 0 ? ((d.valor / totalValor) * 100).toFixed(1) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  )
}
