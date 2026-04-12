'use client'
import { useMemo } from 'react'
import { Extrato } from '@/lib/types'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtL = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L'

interface VeiculoEficiencia {
  placa: string
  nFrota: string
  modelo: string
  grupo: string
  abastecimentos: { data: string; km: number; litros: number; valor: number }[]
  kmTotal: number
  litrosTotal: number
  eficiencia: number | null
  kmAtual: number
}

export default function EficienciaKM({ extratos }: { extratos: Extrato[] }) {
  const veiculos = useMemo(() => {
    const mapa: Record<string, VeiculoEficiencia> = {}

    extratos.forEach(e => {
      e.postos.forEach(p => {
        p.lancamentos.forEach(l => {
          if (!l.km || l.km <= 0) return
          const key = l.placaLida
          if (!mapa[key]) {
            mapa[key] = {
              placa: l.placaLida,
              nFrota: l.nFrota || '',
              modelo: `${l.marca || ''} ${l.modelo || ''}`.trim(),
              grupo: l.grupo || '',
              abastecimentos: [],
              kmTotal: 0,
              litrosTotal: 0,
              eficiencia: null,
              kmAtual: 0,
            }
          }
          mapa[key].abastecimentos.push({ data: l.emissao, km: l.km, litros: l.litros, valor: l.valor })
        })
      })
    })

    return Object.values(mapa).map(v => {
      const ordenados = [...v.abastecimentos].sort((a, b) => a.km - b.km)
      v.abastecimentos = ordenados
      v.kmAtual = ordenados[ordenados.length - 1]?.km || 0
      v.litrosTotal = ordenados.reduce((s, a) => s + a.litros, 0)

      if (ordenados.length >= 2) {
        const kmPercorrido = ordenados[ordenados.length - 1].km - ordenados[0].km
        const litrosConsumidos = ordenados.slice(1).reduce((s, a) => s + a.litros, 0)
        v.kmTotal = kmPercorrido
        v.eficiencia = litrosConsumidos > 0 ? kmPercorrido / litrosConsumidos : null
      }

      return v
    }).filter(v => v.abastecimentos.length > 0)
      .sort((a, b) => {
        if (a.eficiencia === null) return 1
        if (b.eficiencia === null) return -1
        return a.eficiencia - b.eficiencia
      })
  }, [extratos])

  const comEficiencia = veiculos.filter(v => v.eficiencia !== null)
  const mediaEficiencia = comEficiencia.length > 0
    ? comEficiencia.reduce((s, v) => s + (v.eficiencia || 0), 0) / comEficiencia.length
    : 0

  if (veiculos.length === 0) {
    return (
      <div className="estado-vazio">
        <div className="estado-titulo">Dados de KM insuficientes</div>
        <div className="estado-desc">Os extratos não contêm informações de KM suficientes para calcular a eficiência. Verifique se o posto registra o hodômetro nos abastecimentos.</div>
      </div>
    )
  }

  return (
    <div className="eficiencia">
      <div className="cards-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="card">
          <div className="card-label">Veículos com KM registrado</div>
          <div className="card-valor">{veiculos.length}</div>
        </div>
        <div className="card">
          <div className="card-label">Média de eficiência</div>
          <div className="card-valor">{mediaEficiencia > 0 ? `${mediaEficiencia.toFixed(1)} km/L` : '—'}</div>
        </div>
        <div className="card">
          <div className="card-label">Abaixo da média</div>
          <div className={`card-valor ${comEficiencia.filter(v => (v.eficiencia || 0) < mediaEficiencia * 0.8).length > 0 ? 'card-valor-alerta' : ''}`}>
            {comEficiencia.filter(v => (v.eficiencia || 0) < mediaEficiencia * 0.8).length}
          </div>
        </div>
      </div>

      <div className="tabela-hist-wrap">
        <div className="grafico-titulo">Eficiência por veículo (km/L)</div>
        <table className="tabela tabela-sm">
          <thead>
            <tr><th>Veículo</th><th>Grupo</th><th>KM atual</th><th>KM percorrido</th><th>Litros</th><th>Eficiência</th><th>vs. média</th></tr>
          </thead>
          <tbody>
            {veiculos.map((v, i) => {
              const diff = mediaEficiencia > 0 && v.eficiencia
                ? ((v.eficiencia - mediaEficiencia) / mediaEficiencia) * 100
                : null
              const baixa = diff !== null && diff < -20
              return (
                <tr key={i} className={baixa ? 'tr-amarelo' : ''}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{v.placa}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{v.nFrota ? `Prefixo ${v.nFrota}` : ''} {v.modelo}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{v.grupo}</td>
                  <td>{v.kmAtual.toLocaleString('pt-BR')} km</td>
                  <td>{v.kmTotal > 0 ? `${v.kmTotal.toLocaleString('pt-BR')} km` : '—'}</td>
                  <td>{fmtL(v.litrosTotal)}</td>
                  <td style={{ fontWeight: 500 }}>
                    {v.eficiencia !== null ? `${v.eficiencia.toFixed(2)} km/L` : '—'}
                  </td>
                  <td>
                    {diff !== null ? (
                      <span className={`badge-diff ${baixa ? 'badge-vermelho' : diff > 20 ? 'badge-verde' : 'badge-neutro'}`}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(0)}%
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
