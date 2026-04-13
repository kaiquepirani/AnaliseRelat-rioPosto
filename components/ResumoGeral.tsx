'use client'
import { useState, useMemo } from 'react'
import { Lancamento, Extrato } from '@/lib/types'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtL = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L'
const fmtK = (v: number) => v >= 1000 ? `R$${(v/1000).toFixed(1)}k` : fmt(v)

const CORES_COMB = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2']
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
        ...Object.fromEntries(postos.map(nome => [nome, metrica === 'valor' ? parseFloat((pd[nome]?.valor||0).toFixed(2)) : parseFloat((pd[nome]?.litros||0).toFixed(1))]))
      }))
  }, [extratos, postos, metrica])

  const mediaGeral = dadosMensais.length > 0 ? dadosMensais.reduce((s,m) => s + m.total, 0) / dadosMensais.length : 0

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const total = payload.reduce((s: number, p: any) => s + (p.value||0), 0)
    return (
      <div style={{ background:'white', border:'1px solid #e5e7eb', borderRadius:10, padding:'10px 14px', fontSize:12, boxShadow:'0 4px 12px rgba(0,0,0,0.1)' }}>
        <div style={{ fontWeight:700, color:'#2D3A6B', marginBottom:8, fontSize:13 }}>{label}</div>
        {payload.map((p: any, i: number) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <span style={{ width:10, height:10, borderRadius:2, background:p.fill, flexShrink:0 }} />
            <span style={{ color:'#6b7280', flex:1 }}>{p.name.length > 28 ? p.name.slice(0,28)+'…' : p.name}</span>
            <span style={{ fontWeight:600 }}>{metrica==='valor' ? fmt(p.value) : fmtL(p.value)}</span>
          </div>
        ))}
        <div style={{ borderTop:'1px solid #e5e7eb', marginTop:6, paddingTop:6, display:'flex', justifyContent:'space-between', fontWeight:700 }}>
          <span>Total</span>
          <span style={{ color:'#2D3A6B' }}>{metrica==='valor' ? fmt(total) : fmtL(total)}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="resumo">

      {/* Cards */}
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

      {/* Gráfico histórico mensal por posto */}
      {dadosMensais.length > 0 && (
        <div className="grafico-card">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem', flexWrap:'wrap', gap:8 }}>
            <div>
              <div className="grafico-titulo" style={{ margin:0 }}>Gasto mensal por posto</div>
              {dadosMensais.length === 1 && (
                <div style={{ fontSize:11, color:'var(--text-3)', marginTop:3 }}>Apenas 1 mês — o gráfico crescerá conforme novos extratos forem lançados</div>
              )}
            </div>
            <div style={{ display:'flex', gap:4, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:4 }}>
              {(['valor','litros'] as const).map(op => (
                <button key={op} onClick={() => setMetrica(op)} style={{
                  padding:'4px 14px', fontSize:12, fontWeight:600, borderRadius:6, border:'none',
                  background: metrica===op ? 'var(--navy)' : 'transparent',
                  color: metrica===op ? 'white' : 'var(--text-2)',
                  cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s',
                }}>{op==='valor' ? 'Valor R$' : 'Litros'}</button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dadosMensais} margin={{ top:5, right:20, left:10, bottom:5 }} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize:12, fontWeight:600 }} />
              <YAxis tick={{ fontSize:11 }} tickFormatter={v => metrica==='valor' ? fmtK(v) : `${(v/1000).toFixed(1)}kL`} width={60} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize:11 }} formatter={n => n.length>25 ? n.slice(0,25)+'…' : n} />
              {postos.map((nome, i) => (
                <Bar key={nome} dataKey={nome} name={nome} stackId="a" fill={CORES_POSTO[i % CORES_POSTO.length]}
                  radius={i === postos.length-1 ? [3,3,0,0] : [0,0,0,0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Gráficos combustível + status */}
      <div className="graficos-grid">
        <div className="grafico-card">
          <div className="grafico-titulo">Consumo por combustível</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dataComb} margin={{ top:5, right:10, left:10, bottom:5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="nome" tick={{ fontSize:11 }} />
              <YAxis tick={{ fontSize:11 }} />
              <Tooltip formatter={(v: number, name: string) => [name==='valor' ? fmt(v) : fmtL(v), name==='valor' ? 'Valor' : 'Litros']} />
              <Legend wrapperStyle={{ fontSize:11 }} />
              <Bar dataKey="valor" name="Valor (R$)" fill="#2563eb" radius={[4,4,0,0]} />
              <Bar dataKey="litros" name="Litros" fill="#16a34a" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grafico-card">
          <div className="grafico-titulo">Resumo mensal</div>
          <table className="tabela tabela-sm">
            <thead>
              <tr>
                <th>Mês</th>
                <th style={{ textAlign:'right' }}>Total R$</th>
                <th style={{ textAlign:'right' }}>Litros</th>
              </tr>
            </thead>
            <tbody>
              {dadosMensais.slice(-6).map((m, i) => (
                <tr key={i}>
                  <td style={{ fontWeight:600 }}>{m.label}</td>
                  <td style={{ textAlign:'right' }}>{fmt(m.total)}</td>
                  <td style={{ textAlign:'right', fontSize:12, color:'var(--text-2)' }}>{fmtL(m.totalLitros)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabela combustível */}
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
