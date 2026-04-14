'use client'
import { useState, useMemo } from 'react'
import { Extrato, Lancamento } from '@/lib/types'

const GRUPO_TERCEIROS = 'Abastecimentos de Terceiros/Vales'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtL = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L'

function parsarDataBR(data: string): Date | null {
  const m = data.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return null
  let ano = parseInt(m[3])
  if (ano < 100) ano += ano < 50 ? 2000 : 1900
  return new Date(ano, parseInt(m[2]) - 1, parseInt(m[1]))
}

interface LancamentoComPosto extends Lancamento {
  postoNome: string
}

export default function AbastecimentosTerceiros({ extratos }: { extratos: Extrato[] }) {
  const [placaSel, setPlacaSel] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  // Apenas veículos do grupo Terceiros/Vales
  const veiculos = useMemo(() => {
    const mapa: Record<string, { placa: string; modelo: string; grupo: string }> = {}
    extratos.forEach(e => {
      e.postos.forEach(p => {
        p.lancamentos.forEach(l => {
          if (l.grupo !== GRUPO_TERCEIROS) return
          if (!mapa[l.placaLida]) {
            mapa[l.placaLida] = {
              placa: l.placaLida,
              modelo: l.modelo || '',
              grupo: l.grupo || '',
            }
          }
        })
      })
    })
    return Object.values(mapa).sort((a, b) => a.placa.localeCompare(b.placa))
  }, [extratos])

  // Todos os lançamentos de terceiros (sem filtro de placa) para resumo geral
  const todosLancamentos = useMemo(() => {
    const resultado: LancamentoComPosto[] = []
    extratos.forEach(e => {
      e.postos.forEach(p => {
        p.lancamentos.forEach(l => {
          if (l.grupo !== GRUPO_TERCEIROS) return
          resultado.push({ ...l, postoNome: p.nome })
        })
      })
    })
    return resultado.sort((a, b) => {
      const da = parsarDataBR(a.emissao)
      const db = parsarDataBR(b.emissao)
      if (!da || !db) return 0
      return da.getTime() - db.getTime()
    })
  }, [extratos])

  // Lançamentos filtrados por placa e período
  const lancamentosFiltrados = useMemo(() => {
    const base = placaSel
      ? todosLancamentos.filter(l => l.placaLida === placaSel)
      : todosLancamentos

    const inicio = dataInicio ? new Date(dataInicio) : null
    const fim = dataFim ? new Date(dataFim + 'T23:59:59') : null

    return base.filter(l => {
      const d = parsarDataBR(l.emissao)
      if (inicio && d && d < inicio) return false
      if (fim && d && d > fim) return false
      return true
    })
  }, [todosLancamentos, placaSel, dataInicio, dataFim])

  // Resumo por veículo (para tabela geral)
  const resumoPorVeiculo = useMemo(() => {
    const mapa: Record<string, { placa: string; modelo: string; valor: number; litros: number; qtd: number }> = {}
    todosLancamentos.forEach(l => {
      if (!mapa[l.placaLida]) {
        mapa[l.placaLida] = { placa: l.placaLida, modelo: l.modelo || '', valor: 0, litros: 0, qtd: 0 }
      }
      mapa[l.placaLida].valor += l.valor
      mapa[l.placaLida].litros += l.litros
      mapa[l.placaLida].qtd += 1
    })
    return Object.values(mapa).sort((a, b) => b.valor - a.valor)
  }, [todosLancamentos])

  const totalValor = lancamentosFiltrados.reduce((s, l) => s + l.valor, 0)
  const totalLitros = lancamentosFiltrados.reduce((s, l) => s + l.litros, 0)
  const totalGeral = todosLancamentos.reduce((s, l) => s + l.valor, 0)
  const totalLitrosGeral = todosLancamentos.reduce((s, l) => s + l.litros, 0)

  const veiculoSel = veiculos.find(v => v.placa === placaSel)

  const handleExportar = () => {
    const { exportarXLSX } = require('@/lib/exportar')
    const nomeArq = placaSel
      ? `terceiros-${placaSel}-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`
      : `terceiros-todos-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`
    exportarXLSX(
      nomeArq,
      ['Data', 'Placa', 'Responsável', 'Posto', 'Motorista', 'Combustível', 'Litros', 'Vlr. Unit. (R$)', 'Valor (R$)', 'KM'],
      lancamentosFiltrados.map(l => [
        l.emissao,
        l.placaLida,
        l.modelo || '',
        l.postoNome,
        l.motorista || '',
        l.combustivelNome,
        parseFloat(l.litros.toFixed(3)),
        l.vlrUnitario > 0 ? parseFloat(l.vlrUnitario.toFixed(3)) : '',
        parseFloat(l.valor.toFixed(2)),
        l.km || ''
      ]),
      true
    )
  }

  const handleExportarResumo = () => {
    const { exportarXLSX } = require('@/lib/exportar')
    exportarXLSX(
      `terceiros-resumo-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`,
      ['Placa', 'Responsável', 'Abastecimentos', 'Litros', 'Valor Total (R$)'],
      resumoPorVeiculo.map(v => [
        v.placa,
        v.modelo,
        v.qtd,
        parseFloat(v.litros.toFixed(3)),
        parseFloat(v.valor.toFixed(2)),
      ]),
      true
    )
  }

  if (todosLancamentos.length === 0) {
    return (
      <div className="estado-vazio">
        <div className="estado-icone">🚐</div>
        <div className="estado-titulo">Nenhum abastecimento de terceiros encontrado</div>
        <div className="estado-desc">
          Veículos do grupo &quot;Abastecimentos de Terceiros/Vales&quot; aparecerão aqui automaticamente conforme os extratos forem processados.
        </div>
      </div>
    )
  }

  return (
    <div className="analise-veiculo">

      {/* ── Cards totais gerais ── */}
      <div className="cards-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="card">
          <div className="card-label">Total geral terceiros</div>
          <div className="card-valor" style={{ color: '#dc2626' }}>{fmt(totalGeral)}</div>
        </div>
        <div className="card">
          <div className="card-label">Total litros</div>
          <div className="card-valor">{fmtL(totalLitrosGeral)}</div>
        </div>
        <div className="card">
          <div className="card-label">Veículos cadastrados</div>
          <div className="card-valor">{resumoPorVeiculo.length}</div>
        </div>
        <div className="card">
          <div className="card-label">Total abastecimentos</div>
          <div className="card-valor">{todosLancamentos.length}</div>
        </div>
      </div>

      {/* ── Resumo por veículo ── */}
      <div className="tabela-hist-wrap" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div className="grafico-titulo" style={{ margin: 0 }}>Resumo por veículo</div>
          <button onClick={handleExportarResumo} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0.5rem 1rem', fontSize: 12, fontWeight: 600,
            background: 'var(--navy)', color: 'white',
            border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar resumo
          </button>
        </div>
        <table className="tabela">
          <thead>
            <tr>
              <th>Placa</th>
              <th>Responsável</th>
              <th>Abastecimentos</th>
              <th>Litros</th>
              <th>Total (R$)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {resumoPorVeiculo.map(v => (
              <tr
                key={v.placa}
                style={{ cursor: 'pointer', background: placaSel === v.placa ? '#eff6ff' : undefined }}
                onClick={() => setPlacaSel(placaSel === v.placa ? '' : v.placa)}
              >
                <td><strong>{v.placa}</strong></td>
                <td style={{ fontSize: 13, color: 'var(--text-2)' }}>{v.modelo || '—'}</td>
                <td>{v.qtd}</td>
                <td>{fmtL(v.litros)}</td>
                <td style={{ fontWeight: 600, color: '#dc2626' }}>{fmt(v.valor)}</td>
                <td style={{ fontSize: 12, color: 'var(--sky)' }}>
                  {placaSel === v.placa ? '▲ ocultar' : '▼ detalhar'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Detalhe por veículo selecionado ── */}
      <div className="filtros-veiculo" style={{ marginBottom: '1.5rem' }}>
        <div className="filtro-grupo">
          <label className="filtro-label">Filtrar por veículo</label>
          <select className="filtro-select-lg" value={placaSel} onChange={e => setPlacaSel(e.target.value)}>
            <option value="">Todos os veículos</option>
            {veiculos.map(v => (
              <option key={v.placa} value={v.placa}>
                {v.placa}{v.modelo ? ` — ${v.modelo}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="filtro-grupo">
          <label className="filtro-label">De</label>
          <input type="date" className="filtro-date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
        </div>
        <div className="filtro-grupo">
          <label className="filtro-label">Até</label>
          <input type="date" className="filtro-date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
        </div>
        {(dataInicio || dataFim || placaSel) && (
          <button className="btn-limpar" onClick={() => { setDataInicio(''); setDataFim(''); setPlacaSel('') }}>
            Limpar filtros
          </button>
        )}
      </div>

      {/* ── Header do veículo selecionado ── */}
      {placaSel && veiculoSel && (
        <div className="veiculo-header" style={{ marginBottom: '1rem' }}>
          <div className="veiculo-id">
            <span className="veiculo-placa">{placaSel}</span>
          </div>
          {veiculoSel.modelo && (
            <span className="veiculo-modelo">{veiculoSel.modelo}</span>
          )}
          <span className="veiculo-grupo" style={{ background: '#fef3c7', color: '#92400e' }}>
            Terceiros/Vales
          </span>
        </div>
      )}

      {/* ── Cards do filtro atual ── */}
      {(placaSel || dataInicio || dataFim) && lancamentosFiltrados.length > 0 && (
        <div className="cards-grid" style={{ marginBottom: '1.5rem' }}>
          <div className="card">
            <div className="card-label">Total filtrado</div>
            <div className="card-valor" style={{ color: '#dc2626' }}>{fmt(totalValor)}</div>
          </div>
          <div className="card">
            <div className="card-label">Litros</div>
            <div className="card-valor">{fmtL(totalLitros)}</div>
          </div>
          <div className="card">
            <div className="card-label">Abastecimentos</div>
            <div className="card-valor">{lancamentosFiltrados.length}</div>
          </div>
          <div className="card">
            <div className="card-label">Média por abast.</div>
            <div className="card-valor">{fmt(totalValor / lancamentosFiltrados.length)}</div>
          </div>
        </div>
      )}

      {/* ── Tabela de lançamentos ── */}
      <div className="tabela-hist-wrap">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div className="grafico-titulo" style={{ margin: 0 }}>
            {placaSel ? `Histórico — ${placaSel}` : 'Todos os abastecimentos'}
            <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--text-2)', marginLeft: 8 }}>
              ({lancamentosFiltrados.length} registros)
            </span>
          </div>
          <button onClick={handleExportar} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0.5rem 1rem', fontSize: 12, fontWeight: 600,
            background: 'var(--navy)', color: 'white',
            border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar Excel
          </button>
        </div>

        {lancamentosFiltrados.length === 0 ? (
          <div className="estado-vazio">
            <div className="estado-titulo">Nenhum registro no período</div>
            <div className="estado-desc">Ajuste os filtros para ver os abastecimentos</div>
          </div>
        ) : (
          <table className="tabela tabela-sm">
            <thead>
              <tr>
                <th>Data</th>
                <th>Placa</th>
                <th>Responsável</th>
                <th>Posto</th>
                <th>Motorista</th>
                <th>Combustível</th>
                <th>Litros</th>
                <th>Vlr. Unit.</th>
                <th>Valor</th>
                <th>KM</th>
              </tr>
            </thead>
            <tbody>
              {lancamentosFiltrados.map((l, i) => (
                <tr key={i}>
                  <td>{l.emissao}</td>
                  <td><strong>{l.placaLida}</strong></td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{l.modelo || '—'}</td>
                  <td>{l.postoNome}</td>
                  <td style={{ fontSize: 12 }}>{l.motorista || '—'}</td>
                  <td>{l.combustivelNome}</td>
                  <td>{fmtL(l.litros)}</td>
                  <td>{l.vlrUnitario > 0 ? `R$ ${l.vlrUnitario.toFixed(3)}` : '—'}</td>
                  <td style={{ fontWeight: 600, color: '#dc2626' }}>{fmt(l.valor)}</td>
                  <td>{l.km?.toLocaleString('pt-BR') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
