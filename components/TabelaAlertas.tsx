'use client'
import { Lancamento } from '@/lib/types'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function motivoAlerta(l: Lancamento): string {
  if (l.status === 'nao_identificada') {
    return 'Placa não encontrada na relação de frota nem em registros de veículos alugados'
  }
  if (l.status === 'provavel') {
    const placaLida = l.placaLida.replace(/[-\s]/g, '').toUpperCase()
    const placaCorr = (l.placaCorrigida || '').replace(/[-\s]/g, '').toUpperCase()
    const diffs: string[] = []
    for (let i = 0; i < Math.max(placaLida.length, placaCorr.length); i++) {
      if (placaLida[i] !== placaCorr[i]) {
        diffs.push(`posição ${i + 1}: "${placaLida[i] || '—'}" → "${placaCorr[i] || '—'}"`)
      }
    }
    if (diffs.length > 0) {
      return `Possível erro de digitação ou leitura (${diffs.join(', ')}). Veículo mais próximo na frota: ${l.marca} ${l.modelo} (${l.placaCorrigida})`
    }
    return `Correspondência aproximada com ${l.placaCorrigida} — ${l.marca} ${l.modelo}`
  }
  return ''
}

export default function TabelaAlertas({ lancamentos }: { lancamentos: Lancamento[] }) {
  const naoIdentificadas = lancamentos.filter(l => l.status === 'nao_identificada')

  return (
    <div className="alertas">
      {naoIdentificadas.length > 0 && (
        <div className="alerta-secao">
          <div className="alerta-header alerta-vermelho">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Placas não identificadas na frota — investigar ({naoIdentificadas.length} lançamentos · {fmt(naoIdentificadas.reduce((s, l) => s + l.valor, 0))})
          </div>
          <table className="tabela">
            <thead>
              <tr>
                <th>Placa</th>
                <th>Motivo do alerta</th>
                <th>Data</th>
                <th>Combustível</th>
                <th>Litros</th>
                <th>Valor</th>
                <th>Documento</th>
              </tr>
            </thead>
            <tbody>
              {naoIdentificadas.map((l, i) => (
                <tr key={i} className="tr-vermelho">
                  <td><code>{l.placaLida}</code></td>
                  <td>
                    <span className="motivo-alerta motivo-vermelho">{motivoAlerta(l)}</span>
                  </td>
                  <td>{l.emissao}</td>
                  <td>{l.combustivelNome}</td>
                  <td>{l.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L</td>
                  <td>{fmt(l.valor)}</td>
                  <td><small>{l.documento}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {naoIdentificadas.length === 0 && (
        <div className="estado-vazio">
          <div className="estado-icone">✓</div>
          <div className="estado-titulo">Nenhum alerta</div>
          <div className="estado-desc">Todas as placas foram identificadas na frota</div>
        </div>
      )}
    </div>
  )
}
