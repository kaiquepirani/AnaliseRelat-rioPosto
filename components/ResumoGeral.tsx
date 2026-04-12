'use client'
import { Lancamento } from '@/lib/types'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtL = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L'

const CORES_COMB = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2']

interface Props {
  totalValor: number
  totalLitros: number
  totalVeiculos: number
  alertas: {
    confirmadaValor: number
    provalValor: number
    naoIdentificadaValor: number
    confirmada: number
    provavel: number
    naoIdentificada: number
  }
  lancamentos: Lancamento[]
}

export default function ResumoGeral({ totalValor, totalLitros, totalVeiculos, alertas, lancamentos }: Props) {
  const porCombustivel: Record<string, { valor: number; litros: number }> = {}
  lancamentos.forEach(l => {
    if (!porCombustivel[l.combustivelNome]) porCombustivel[l.combustivelNome] = { valor: 0, litros: 0 }
    porCombustivel[l.combustivelNome].valor += l.valor
    porCombustivel[l.combustivelNome].litros += l.litros
  })

  const dataComb = Object.entries(porCombustivel).map(([nome, d]) => ({ nome, ...d }))
  const dataStatus = [
    { nome: 'Confirmada', valor: alertas.confirmadaValor + alertas.provalValor, fill: '#16a34a' },
    { nome: 'Investigar', valor: alertas.naoIdentificadaValor, fill: '#dc2626' },
  ].filter(d => d.valor > 0)

  const totalAlerta = alertas.naoIdentificadaValor

  return (
    <div className="resumo">
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
          <div className="card-label">Veículos atendidos</div>
          <div className="card-valor">{totalVeiculos}</div>
        </div>
        <div className={`card ${totalAlerta > 0 ? 'card-alerta' : 'card-ok'}`}>
          <div className="card-label">Placas a investigar</div>
          <div className="card-valor">{fmt(totalAlerta)}</div>
          <div className="card-sub">{alertas.naoIdentificada} placa{alertas.naoIdentificada !== 1 ? 's' : ''} não identificada{alertas.naoIdentificada !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <div className="graficos-grid">
        <div className="grafico-card">
          <div className="grafico-titulo">Distribuição por status de placa</div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={dataStatus} dataKey="valor" nameKey="nome" cx="50%" cy="50%" outerRadius={80} label={({ nome, percent }) => `${nome} ${(percent * 100).toFixed(0)}%`}>
                {dataStatus.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip formatter={(v: number) => fmt(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="grafico-card">
          <div className="grafico-titulo">Consumo por tipo de combustível</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dataComb} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number, name: string) => [name === 'valor' ? fmt(v) : fmtL(v), name === 'valor' ? 'Valor' : 'Litros']} />
              <Legend />
              <Bar dataKey="valor" name="Valor (R$)" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="litros" name="Litros" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

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
