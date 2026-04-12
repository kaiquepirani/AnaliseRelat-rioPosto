'use client'
import { Extrato } from '@/lib/types'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function parsarDataBR(data: string): Date | null {
  // Aceita DD/MM/YY ou DD/MM/YYYY
  const m = data.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return null
  let ano = parseInt(m[3])
  if (ano < 100) ano += ano < 50 ? 2000 : 1900
  return new Date(ano, parseInt(m[2]) - 1, parseInt(m[1]))
}

function periodoReal(extrato: Extrato): { label: string; dataInicio: Date | null } {
  const lancamentos = extrato.postos.flatMap(p => p.lancamentos)
  const datas = lancamentos
    .map(l => parsarDataBR(l.emissao))
    .filter((d): d is Date => d !== null)

  if (datas.length === 0) return { label: extrato.periodo || extrato.arquivo, dataInicio: null }

  const menor = new Date(Math.min(...datas.map(d => d.getTime())))
  const maior = new Date(Math.max(...datas.map(d => d.getTime())))

  const fmtData = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const label = menor.getTime() === maior.getTime()
    ? fmtData(menor)
    : `${fmtData(menor)} a ${fmtData(maior)}`

  return { label, dataInicio: menor }
}

export default function HistoricoComparativo({ extratos }: { extratos: Extrato[] }) {
  // Ordenar por data real dos abastecimentos
  const comPeriodo = extratos.map(e => ({ extrato: e, ...periodoReal(e) }))
  const ordenados = [...comPeriodo].sort((a, b) => {
    if (!a.dataInicio) return 1
    if (!b.dataInicio) return -1
    return a.dataInicio.getTime() - b.dataInicio.getTime()
  })

  const dataGrafico = ordenados.map(e => ({
    periodo: e.label,
    valor: parseFloat(e.extrato.totalValor.toFixed(2)),
    litros: parseFloat(e.extrato.totalLitros.toFixed(1)),
    veiculos: e.extrato.totalVeiculos,
  }))

  const kmVeiculosAgregado: Record<string, number[]> = {}
  ordenados.forEach(({ extrato: e }) => {
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
            <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
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
            <tr><th>Período real</th><th>Posto</th><th>Total R$</th><th>Total litros</th><th>Veículos</th><th>Alertas</th></tr>
          </thead>
          <tbody>
            {ordenados.map(({ extrato: e, label }, i) => (
              <tr key={i}>
                <td>{label}</td>
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
