'use client'
import { useMemo } from 'react'
import { Extrato, Lancamento } from '@/lib/types'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtL = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L'

// Limite de litros por grupo (tanque típico + margem)
const LIMITES_GRUPO: Record<string, number> = {
  'Carro Baixo Convencional': 55,
  'Spin 6+1': 65,
  'Doblo': 70,
  'Van 15 Teto Alto': 100,
  'Van 15 Teto Baixo': 100,
  'VAN MASTER': 100,
  'Van 19 Lugares': 100,
  'Micro Onibus': 150,
  'Ônibus': 300,
  'Onibus': 300,
}

function getLimite(grupo: string): number {
  for (const [key, limite] of Object.entries(LIMITES_GRUPO)) {
    if (grupo.toLowerCase().includes(key.toLowerCase())) return limite
  }
  return 200 // padrão conservador
}

function parsarDataBR(data: string): string {
  return data // já está em DD/MM/YY
}

interface AlertaAtipico {
  tipo: 'volume_alto' | 'duplo_dia' | 'intervalo_curto'
  placa: string
  nFrota: string
  grupo: string
  modelo: string
  data: string
  posto: string
  litros: number
  valor: number
  descricao: string
  documento: string
}

export default function AlertasAtipicos({ extratos }: { extratos: Extrato[] }) {
  const alertas = useMemo(() => {
    const result: AlertaAtipico[] = []
    const porVeiculo: Record<string, (Lancamento & { postoNome: string })[]> = {}

    extratos.forEach(e => {
      e.postos.forEach(p => {
        p.lancamentos.forEach(l => {
          if (!porVeiculo[l.placaLida]) porVeiculo[l.placaLida] = []
          porVeiculo[l.placaLida].push({ ...l, postoNome: p.nome })

          // 1. Volume alto para o grupo
          const limite = getLimite(l.grupo || '')
          if (l.litros > limite) {
            result.push({
              tipo: 'volume_alto',
              placa: l.placaLida,
              nFrota: l.nFrota || '',
              grupo: l.grupo || '',
              modelo: `${l.marca || ''} ${l.modelo || ''}`.trim(),
              data: l.emissao,
              posto: p.nome,
              litros: l.litros,
              valor: l.valor,
              descricao: `Volume de ${l.litros.toFixed(1)}L supera o limite esperado de ${limite}L para este grupo`,
              documento: l.documento,
            })
          }
        })
      })
    })

    // 2. Dois abastecimentos no mesmo dia para a mesma placa
    Object.entries(porVeiculo).forEach(([placa, lances]) => {
      const porDia: Record<string, typeof lances> = {}
      lances.forEach(l => {
        if (!porDia[l.emissao]) porDia[l.emissao] = []
        porDia[l.emissao].push(l)
      })
      Object.entries(porDia).forEach(([data, grupo]) => {
        if (grupo.length >= 2) {
          const totalDia = grupo.reduce((s, l) => s + l.litros, 0)
          const l0 = grupo[0]
          result.push({
            tipo: 'duplo_dia',
            placa,
            nFrota: l0.nFrota || '',
            grupo: l0.grupo || '',
            modelo: `${l0.marca || ''} ${l0.modelo || ''}`.trim(),
            data,
            posto: grupo.map(l => l.postoNome).join(' e '),
            litros: totalDia,
            valor: grupo.reduce((s, l) => s + l.valor, 0),
            descricao: `${grupo.length} abastecimentos no mesmo dia totalizando ${totalDia.toFixed(1)}L`,
            documento: grupo.map(l => l.documento).join(', '),
          })
        }
      })
    })

    return result.sort((a, b) => {
      const ordem = { volume_alto: 0, duplo_dia: 1, intervalo_curto: 2 }
      return ordem[a.tipo] - ordem[b.tipo]
    })
  }, [extratos])

  const tipoLabel: Record<string, string> = {
    volume_alto: 'Volume acima do esperado',
    duplo_dia: 'Dois abastecimentos no mesmo dia',
    intervalo_curto: 'Intervalo curto entre abastecimentos',
  }

  const tipoClasse: Record<string, string> = {
    volume_alto: 'badge-vermelho',
    duplo_dia: 'badge-amarelo',
    intervalo_curto: 'badge-amarelo',
  }

  const volumeAlto = alertas.filter(a => a.tipo === 'volume_alto')
  const duploDia = alertas.filter(a => a.tipo === 'duplo_dia')

  if (alertas.length === 0) {
    return (
      <div className="estado-vazio">
        <div className="estado-icone">✓</div>
        <div className="estado-titulo">Nenhum abastecimento atípico</div>
        <div className="estado-desc">Todos os abastecimentos estão dentro dos padrões esperados</div>
      </div>
    )
  }

  return (
    <div className="alertas-atipicos">
      <div className="cards-grid" style={{ marginBottom: '1.5rem' }}>
        <div className={`card ${volumeAlto.length > 0 ? 'card-alerta' : 'card-ok'}`}>
          <div className="card-label">Volume acima do esperado</div>
          <div className="card-valor">{volumeAlto.length}</div>
          <div className="card-sub">{fmt(volumeAlto.reduce((s, a) => s + a.valor, 0))}</div>
        </div>
        <div className={`card ${duploDia.length > 0 ? 'card-alerta' : 'card-ok'}`}>
          <div className="card-label">Duplo abast. mesmo dia</div>
          <div className="card-valor">{duploDia.length}</div>
          <div className="card-sub">{fmt(duploDia.reduce((s, a) => s + a.valor, 0))}</div>
        </div>
      </div>

      {volumeAlto.length > 0 && (
        <div className="alerta-secao" style={{ marginBottom: '1.5rem' }}>
          <div className="alerta-header alerta-vermelho">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Volume acima do esperado ({volumeAlto.length} ocorrências)
          </div>
          <table className="tabela tabela-sm">
            <thead><tr><th>Data</th><th>Placa</th><th>Grupo</th><th>Litros</th><th>Valor</th><th>Motivo</th></tr></thead>
            <tbody>
              {volumeAlto.map((a, i) => (
                <tr key={i} className="tr-vermelho">
                  <td>{a.data}</td>
                  <td>
                    <code>{a.placa}</code>
                    {a.nFrota && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Prefixo {a.nFrota}</div>}
                  </td>
                  <td style={{ fontSize: 12 }}>{a.grupo}</td>
                  <td>{fmtL(a.litros)}</td>
                  <td>{fmt(a.valor)}</td>
                  <td style={{ fontSize: 12, color: 'var(--red)' }}>{a.descricao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {duploDia.length > 0 && (
        <div className="alerta-secao">
          <div className="alerta-header alerta-amarelo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Dois abastecimentos no mesmo dia ({duploDia.length} ocorrências)
          </div>
          <table className="tabela tabela-sm">
            <thead><tr><th>Data</th><th>Placa</th><th>Grupo</th><th>Total litros</th><th>Total valor</th><th>Detalhe</th></tr></thead>
            <tbody>
              {duploDia.map((a, i) => (
                <tr key={i} className="tr-amarelo">
                  <td>{a.data}</td>
                  <td>
                    <code>{a.placa}</code>
                    {a.nFrota && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Prefixo {a.nFrota}</div>}
                  </td>
                  <td style={{ fontSize: 12 }}>{a.grupo}</td>
                  <td>{fmtL(a.litros)}</td>
                  <td>{fmt(a.valor)}</td>
                  <td style={{ fontSize: 12, color: 'var(--amber)' }}>{a.descricao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
