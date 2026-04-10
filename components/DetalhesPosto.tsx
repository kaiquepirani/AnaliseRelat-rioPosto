'use client'
import { ResumoPosto } from '@/lib/types'
import { useState } from 'react'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtL = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L'

export default function DetalhesPosto({ posto }: { posto: ResumoPosto }) {
  const [expandido, setExpandido] = useState(false)

  return (
    <div className="posto-card">
      <div className="posto-header" onClick={() => setExpandido(!expandido)}>
        <div className="posto-info">
          <div className="posto-nome">{posto.nome}</div>
          <div className="posto-cnpj">CNPJ: {posto.cnpj}</div>
        </div>
        <div className="posto-numeros">
          <div className="posto-num">{fmt(posto.totalValor)}</div>
          <div className="posto-num-sub">{fmtL(posto.totalLitros)} · {posto.totalVeiculos} veículos</div>
        </div>
        <div className="posto-toggle">{expandido ? '▲' : '▼'}</div>
      </div>

      <div className="posto-combustiveis">
        {Object.entries(posto.porCombustivel).map(([nome, d]) => (
          <div key={nome} className="comb-badge">
            <span className="comb-nome">{nome}</span>
            <span className="comb-val">{fmt(d.valor)}</span>
            <span className="comb-litros">{fmtL(d.litros)}</span>
          </div>
        ))}
      </div>

      {expandido && (
        <div className="posto-lancamentos">
          <table className="tabela tabela-sm">
            <thead>
              <tr><th>Data</th><th>Placa</th><th>Veículo</th><th>Combustível</th><th>Litros</th><th>KM</th><th>Valor</th><th>Status</th></tr>
            </thead>
            <tbody>
              {posto.lancamentos.map((l, i) => (
                <tr key={i}>
                  <td>{l.emissao}</td>
                  <td><code>{l.placaLida}</code></td>
                  <td>{l.modelo ? `${l.marca} ${l.modelo}` : '—'}</td>
                  <td>{l.combustivelNome}</td>
                  <td>{l.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td>
                  <td>{l.km?.toLocaleString('pt-BR') || '—'}</td>
                  <td>{fmt(l.valor)}</td>
                  <td>
                    <span className={`status-badge status-${l.status}`}>
                      {l.status === 'confirmada' ? '✓' : l.status === 'provavel' ? '⚠' : '✗'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
