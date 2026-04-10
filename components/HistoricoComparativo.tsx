'use client'
import { Extrato } from '@/lib/types'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function HistoricoComparativo({ extratos }: { extratos: Extrato[] }) {
  const ordenados = [...extratos].sort((a, b) => new Date(a.dataUpload).getTime() - new Date(b.dataUpload).getTime())

  const dataGrafico = ordenados.map(e => ({
    periodo: e.periodo || new Date(e.dataUpload).toLocaleDateString('pt-BR'),
    valor: parseFloat(e.totalValor.toFixed(2)),
    litros: parseFloat(e.totalLitros.toFixed(1)),
    veiculos: e.totalVeiculos,
  }))

  const kmVeiculosAgregado: Record<string, number[]> = {}
  ordenados.forEach(e => {
    Object.entries(e.kmVeiculos || {}).forEach(([placa, d]) => {
      if (d.mediaPeriodo) {
        if (!kmVeiculosAgregado[placa]) kmVeiculosAgregado[placa] = []
        kmVeiculosAgregado[placa].push(d.mediaPeriodo)
      }
    })
  })

  return (
    <div className="historico">
      <div className="grafico-card">
        <div className="grafico-titulo">Evolução do gasto total por período</div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={dataGrafico} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="periodo" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => fmt(v)} />
            <Legend />
            <Line type="monotone" dataKey="valor" name="Valor (R$)" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="tabela-hist-wrap">
        <div className="grafico-titulo">Tabela comparativa por período</div>
        <table className="tabela">
          <thead>
            <tr><th>Período</th><th>Posto</th><th>Total R$</th><th>Total litros</th><th>Veículos</th><th>Alertas</th></tr>
          </thead>
          <tbody>
            {ordenados.map((e, i) => (
              <tr key={i}>
                <td>{e.periodo || new Date(e.dataUpload).toLocaleDateString('pt-BR')}</td>
                <td>{e.postos.map(p => p.nome).join(', ')}</td>
                <td>{fmt(e.totalValor)}</td>
                <td>{e.totalLitros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L</td>
                <td>{e.totalVeiculos}</td>
                <td>
                  {e.alertas.naoIdentificada > 0 && <span className="badge-vermelho">{e.alertas.naoIdentificada} investigar</span>}
                  {e.alertas.provavel > 0 && <span className="badge-amarelo">{e.alertas.provavel} verificar</span>}
                  {e.alertas.naoIdentificada === 0 && e.alertas.provavel === 0 && <span className="badge-verde">OK</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {Object.keys(kmVeiculosAgregado).length > 0 && (
        <div className="tabela-hist-wrap">
          <div className="grafico-titulo">KM médio por veículo</div>
          <table className="tabela">
            <thead><tr><th>Placa</th><th>Períodos registrados</th><th>Média de KM rodado</th></tr></thead>
            <tbody>
              {Object.entries(kmVeiculosAgregado).map(([placa, medias]) => (
                <tr key={placa}>
                  <td><code>{placa}</code></td>
                  <td>{medias.length}</td>
                  <td>{Math.round(medias.reduce((s, v) => s + v, 0) / medias.length).toLocaleString('pt-BR')} km</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
