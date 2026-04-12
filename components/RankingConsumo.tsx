'use client'
import { useMemo } from 'react'
import { Extrato, Lancamento } from '@/lib/types'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtL = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L'

interface VeiculoRanking {
  placa: string
  nFrota: string
  modelo: string
  grupo: string
  totalValor: number
  totalLitros: number
  qtdAbastecimentos: number
  mediaLitros: number
  postos: string[]
}

export default function RankingConsumo({ extratos }: { extratos: Extrato[] }) {
  const { veiculos, mediaGeral, porGrupo } = useMemo(() => {
    const mapa: Record<string, VeiculoRanking> = {}
    const grupoMap: Record<string, { valor: number; litros: number; veiculos: Set<string> }> = {}

    extratos.forEach(e => {
      e.postos.forEach(p => {
        p.lancamentos.forEach(l => {
          const key = l.placaLida
          if (!mapa[key]) {
            mapa[key] = {
              placa: l.placaLida,
              nFrota: l.nFrota || '',
              modelo: l.modelo ? `${l.marca || ''} ${l.modelo}`.trim() : '',
              grupo: l.grupo || 'Não identificado',
              totalValor: 0,
              totalLitros: 0,
              qtdAbastecimentos: 0,
              mediaLitros: 0,
              postos: [],
            }
          }
          mapa[key].totalValor += l.valor
          mapa[key].totalLitros += l.litros
          mapa[key].qtdAbastecimentos += 1
          if (!mapa[key].postos.includes(p.nome)) mapa[key].postos.push(p.nome)

          const g = l.grupo || 'Não identificado'
          if (!grupoMap[g]) grupoMap[g] = { valor: 0, litros: 0, veiculos: new Set() }
          grupoMap[g].valor += l.valor
          grupoMap[g].litros += l.litros
          grupoMap[g].veiculos.add(key)
        })
      })
    })

    const veiculos = Object.values(mapa)
      .map(v => ({ ...v, mediaLitros: v.totalLitros / v.qtdAbastecimentos }))
      .sort((a, b) => b.totalValor - a.totalValor)

    const totalGeral = veiculos.reduce((s, v) => s + v.totalValor, 0)
    const mediaGeral = veiculos.length > 0 ? totalGeral / veiculos.length : 0

    const porGrupo = Object.entries(grupoMap)
      .map(([grupo, d]) => ({ grupo, ...d, nVeiculos: d.veiculos.size, mediaVeiculo: d.valor / d.veiculos.size }))
      .sort((a, b) => b.valor - a.valor)

    return { veiculos, mediaGeral, porGrupo }
  }, [extratos])

  const top10 = veiculos.slice(0, 10)
  const totalGeral = veiculos.reduce((s, v) => s + v.totalValor, 0)

  return (
    <div className="ranking">
      <div className="cards-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="card">
          <div className="card-label">Total da frota</div>
          <div className="card-valor">{fmt(totalGeral)}</div>
        </div>
        <div className="card">
          <div className="card-label">Média por veículo</div>
          <div className="card-valor">{fmt(mediaGeral)}</div>
        </div>
        <div className="card">
          <div className="card-label">Veículos ativos</div>
          <div className="card-valor">{veiculos.length}</div>
        </div>
        <div className="card">
          <div className="card-label">Acima da média</div>
          <div className="card-valor card-valor-alerta">{veiculos.filter(v => v.totalValor > mediaGeral * 1.3).length}</div>
        </div>
      </div>

      <div className="tabela-hist-wrap" style={{ marginBottom: '1.5rem' }}>
        <div className="grafico-titulo">Top 10 — maiores consumidores</div>
        <table className="tabela tabela-sm">
          <thead>
            <tr><th>#</th><th>Veículo</th><th>Grupo</th><th>Abast.</th><th>Litros</th><th>Total R$</th><th>vs. média</th></tr>
          </thead>
          <tbody>
            {top10.map((v, i) => {
              const diff = mediaGeral > 0 ? ((v.totalValor - mediaGeral) / mediaGeral) * 100 : 0
              const acima = diff > 30
              return (
                <tr key={v.placa} className={acima ? 'tr-amarelo' : ''}>
                  <td style={{ color: 'var(--text-3)', fontWeight: i < 3 ? 600 : 400 }}>{i + 1}</td>
                  <td>
                    <div style={{ fontWeight: 500 }}>{v.placa}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{v.nFrota ? `Prefixo ${v.nFrota}` : ''} {v.modelo}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{v.grupo}</td>
                  <td>{v.qtdAbastecimentos}</td>
                  <td>{fmtL(v.totalLitros)}</td>
                  <td style={{ fontWeight: 500 }}>{fmt(v.totalValor)}</td>
                  <td>
                    <span className={`badge-diff ${acima ? 'badge-vermelho' : diff < -20 ? 'badge-verde' : 'badge-neutro'}`}>
                      {diff > 0 ? '+' : ''}{diff.toFixed(0)}%
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="tabela-hist-wrap">
        <div className="grafico-titulo">Consumo por grupo de veículo</div>
        <table className="tabela tabela-sm">
          <thead>
            <tr><th>Grupo</th><th>Veículos</th><th>Total litros</th><th>Total R$</th><th>Média por veículo</th><th>% do total</th></tr>
          </thead>
          <tbody>
            {porGrupo.map((g, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>{g.grupo}</td>
                <td>{g.nVeiculos}</td>
                <td>{fmtL(g.litros)}</td>
                <td>{fmt(g.valor)}</td>
                <td>{fmt(g.mediaVeiculo)}</td>
                <td>{totalGeral > 0 ? ((g.valor / totalGeral) * 100).toFixed(1) : 0}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
