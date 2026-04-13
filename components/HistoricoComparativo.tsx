'use client'
import { useState, useMemo } from 'react'
import { Extrato } from '@/lib/types'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, ReferenceLine } from 'recharts'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtL = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L'
const fmtK = (v: number) => v >= 1000 ? `R$${(v/1000).toFixed(1)}k` : fmt(v)

const CORES = ['#2D3A6B', '#4AABDB', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316']

function parsarDataBR(data: string): Date | null {
  const m = data.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return null
  let ano = parseInt(m[3])
  if (ano < 100) ano += ano < 50 ? 2000 : 1900
  return new Date(ano, parseInt(m[2]) - 1, parseInt(m[1]))
}

function mesAnoKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function labelMes(key: string): string {
  const [ano, mes] = key.split('-')
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${nomes[parseInt(mes) - 1]}/${ano.slice(2)}`
}

const CustomTooltip = ({ active, payload, label, metrica }: any) => {
  if (!active || !payload?.length) return null
  const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0)
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }}>
      <div style={{ fontWeight: 700, color: '#2D3A6B', marginBottom: 8, fontSize: 13 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: p.fill, flexShrink: 0 }} />
          <span style={{ color: '#6b7280', flex: 1 }}>{p.name.length > 30 ? p.name.slice(0, 30) + '…' : p.name}</span>
          <span style={{ fontWeight: 600, color: '#111' }}>{metrica === 'valor' ? fmt(p.value) : fmtL(p.value)}</span>
        </div>
      ))}
      <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
        <span>Total</span>
        <span style={{ color: '#2D3A6B' }}>{metrica === 'valor' ? fmt(total) : fmtL(total)}</span>
      </div>
    </div>
  )
}

export default function HistoricoComparativo({ extratos }: { extratos: Extrato[] }) {
  const [metrica, setMetrica] = useState<'valor' | 'litros'>('valor')
  const [mesSel, setMesSel] = useState<string>('')

  const postos = useMemo(() => {
    const nomes = new Set<string>()
    extratos.forEach(e => e.postos.forEach(p => nomes.add(p.nome)))
    return Array.from(nomes).sort()
  }, [extratos])

  // Dados mensais agregados por posto
  const dadosMensais = useMemo(() => {
    const mapa: Record<string, Record<string, { valor: number; litros: number }>> = {}
    extratos.forEach(e => {
      e.postos.forEach(posto => {
        posto.lancamentos.forEach(l => {
          const d = parsarDataBR(l.emissao)
          if (!d) return
          const key = mesAnoKey(d)
          if (!mapa[key]) mapa[key] = {}
          if (!mapa[key][posto.nome]) mapa[key][posto.nome] = { valor: 0, litros: 0 }
          mapa[key][posto.nome].valor += l.valor
          mapa[key][posto.nome].litros += l.litros
        })
      })
    })

    return Object.entries(mapa)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, postosDados]) => {
        const total = Object.values(postosDados).reduce((s, v) => s + v.valor, 0)
        const totalLitros = Object.values(postosDados).reduce((s, v) => s + v.litros, 0)
        return {
          key, label: labelMes(key), total, totalLitros,
          postos: postosDados,
          ...Object.fromEntries(postos.map(nome => [
            nome,
            metrica === 'valor'
              ? parseFloat((postosDados[nome]?.valor || 0).toFixed(2))
              : parseFloat((postosDados[nome]?.litros || 0).toFixed(1))
          ]))
        }
      })
  }, [extratos, postos, metrica])

  const meses = dadosMensais.map(d => d.key)
  const mesSelecionado = mesSel || meses[meses.length - 1] || ''
  const dadosMesSel = dadosMensais.find(d => d.key === mesSelecionado)

  // Dados do mês selecionado para o gráfico de barras lado a lado
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

  const mediaGeral = dadosMensais.length > 0
    ? dadosMensais.reduce((s, m) => s + m.total, 0) / dadosMensais.length : 0

  if (extratos.length === 0) {
    return <div className="estado-vazio"><div className="estado-desc">Nenhum extrato carregado</div></div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Cards resumo */}
      <div className="cards-grid">
        <div className="card">
          <div className="card-label">Meses com dados</div>
          <div className="card-valor">{dadosMensais.length}</div>
        </div>
        <div className="card">
          <div className="card-label">Postos monitorados</div>
          <div className="card-valor">{postos.length}</div>
        </div>
        <div className="card">
          <div className="card-label">Média mensal</div>
          <div className="card-valor" style={{ fontSize: 18 }}>{fmt(mediaGeral)}</div>
        </div>
        <div className="card">
          <div className="card-label">Total geral</div>
          <div className="card-valor" style={{ fontSize: 18 }}>{fmt(extratos.reduce((s, e) => s + e.totalValor, 0))}</div>
        </div>
      </div>

      {/* Controles */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 4 }}>
          {(['valor', 'litros'] as const).map(op => (
            <button key={op} onClick={() => setMetrica(op)} style={{
              padding: '5px 16px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none',
              background: metrica === op ? 'var(--navy)' : 'transparent',
              color: metrica === op ? 'white' : 'var(--text-2)',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
            }}>{op === 'valor' ? 'Valor R$' : 'Litros'}</button>
          ))}
        </div>
      </div>

      {/* GRÁFICO 1 — Evolução mensal empilhada por posto */}
      <div className="grafico-card">
        <div className="grafico-titulo">Evolução mensal — todos os postos</div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>Clique em um mês para ver o detalhamento</div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={dadosMensais} margin={{ top: 5, right: 20, left: 10, bottom: 5 }} barCategoryGap="25%"
            onClick={d => d?.activeLabel && setMesSel(dadosMensais.find(m => m.label === d.activeLabel)?.key || '')}
            style={{ cursor: 'pointer' }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 600 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => metrica === 'valor' ? fmtK(v) : `${(v/1000).toFixed(1)}kL`} width={60} />
            <Tooltip content={<CustomTooltip metrica={metrica} />} />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={n => n.length > 25 ? n.slice(0, 25) + '…' : n} />
            {postos.map((nome, i) => (
              <Bar key={nome} dataKey={nome} name={nome} stackId="a" fill={CORES[i % CORES.length]}
                radius={i === postos.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
            ))}
            {mesSelecionado && (
              <ReferenceLine x={labelMes(mesSelecionado)} stroke="#2D3A6B" strokeWidth={2} strokeDasharray="4 2" />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* GRÁFICO 2 — Postos lado a lado no mês selecionado */}
      {dadosMesSel && (
        <div className="grafico-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '1rem' }}>
            <div>
              <div className="grafico-titulo" style={{ margin: 0 }}>Postos em {labelMes(mesSelecionado)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                Total: <strong style={{ color: 'var(--navy)' }}>{metrica === 'valor' ? fmt(dadosMesSel.total) : fmtL(dadosMesSel.totalLitros)}</strong>
              </div>
            </div>
            {/* Seletor de mês */}
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

          <ResponsiveContainer width="100%" height={Math.max(220, dadosPostosMes.length * 48)}>
            <BarChart data={dadosPostosMes} layout="vertical" margin={{ top: 0, right: 60, left: 8, bottom: 0 }} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => metrica === 'valor' ? fmtK(v) : `${(v/1000).toFixed(1)}kL`} />
              <YAxis type="category" dataKey="nome" tick={{ fontSize: 12, fontWeight: 500 }} width={200} />
              <Tooltip
                formatter={(v: number) => [metrica === 'valor' ? fmt(v) : fmtL(v), metrica === 'valor' ? 'Valor' : 'Litros']}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey={metrica === 'valor' ? 'valor' : 'litros'} radius={[0, 4, 4, 0]}
                label={{ position: 'right', fontSize: 11, fontWeight: 600, formatter: (v: number) => metrica === 'valor' ? fmtK(v) : fmtL(v) }}>
                {dadosPostosMes.map((_, i) => (
                  <rect key={i} fill={CORES[postos.indexOf(_.nomeCompleto) % CORES.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela mensal */}
      <div className="tabela-hist-wrap">
        <div className="grafico-titulo">Resumo mensal por posto</div>
        <table className="tabela tabela-sm">
          <thead>
            <tr>
              <th>Mês</th>
              {postos.map(p => <th key={p} style={{ textAlign: 'right' }}>{p.length > 22 ? p.slice(0, 22) + '…' : p}</th>)}
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
                    {(m as any)[p] > 0 ? (metrica === 'valor' ? fmt((m as any)[p]) : fmtL((m as any)[p])) : '—'}
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
                const t = extratos.flatMap(e => e.postos).filter(p => p.nome === nome).reduce((s, p) => s + (metrica === 'valor' ? p.totalValor : p.totalLitros), 0)
                return <td key={nome} style={{ textAlign: 'right', fontWeight: 700, fontSize: 12 }}>{metrica === 'valor' ? fmt(t) : fmtL(t)}</td>
              })}
              <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--navy)' }}>
                {metrica === 'valor' ? fmt(extratos.reduce((s, e) => s + e.totalValor, 0)) : fmtL(extratos.reduce((s, e) => s + e.totalLitros, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

    </div>
  )
}
