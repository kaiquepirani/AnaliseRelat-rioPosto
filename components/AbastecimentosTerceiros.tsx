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
  const [responsavelSel, setResponsavelSel] = useState('')
  const [placaSel, setPlacaSel] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  // Todos os lançamentos de terceiros
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

  // Lista de responsáveis únicos
  const responsaveis = useMemo(() => {
    const set = new Set<string>()
    todosLancamentos.forEach(l => { if (l.modelo) set.add(l.modelo) })
    return Array.from(set).sort()
  }, [todosLancamentos])

  // Veículos disponíveis conforme responsável selecionado
  const veiculos = useMemo(() => {
    const mapa: Record<string, { placa: string; modelo: string }> = {}
    todosLancamentos.forEach(l => {
      if (responsavelSel && l.modelo !== responsavelSel) return
      if (!mapa[l.placaLida]) {
        mapa[l.placaLida] = { placa: l.placaLida, modelo: l.modelo || '' }
      }
    })
    return Object.values(mapa).sort((a, b) => a.placa.localeCompare(b.placa))
  }, [todosLancamentos, responsavelSel])

  // Lançamentos filtrados por responsável, placa e período
  const lancamentosFiltrados = useMemo(() => {
    const inicio = dataInicio ? new Date(dataInicio) : null
    const fim = dataFim ? new Date(dataFim + 'T23:59:59') : null
    return todosLancamentos.filter(l => {
      if (responsavelSel && l.modelo !== responsavelSel) return false
      if (placaSel && l.placaLida !== placaSel) return false
      const d = parsarDataBR(l.emissao)
      if (inicio && d && d < inicio) return false
      if (fim && d && d > fim) return false
      return true
    })
  }, [todosLancamentos, responsavelSel, placaSel, dataInicio, dataFim])

  // Resumo por responsável (tabela geral)
  const resumoPorResponsavel = useMemo(() => {
    const mapa: Record<string, { responsavel: string; placas: Set<string>; valor: number; litros: number; qtd: number }> = {}
    todosLancamentos.forEach(l => {
      const resp = l.modelo || '—'
      if (!mapa[resp]) mapa[resp] = { responsavel: resp, placas: new Set(), valor: 0, litros: 0, qtd: 0 }
      mapa[resp].placas.add(l.placaLida)
      mapa[resp].valor += l.valor
      mapa[resp].litros += l.litros
      mapa[resp].qtd += 1
    })
    return Object.values(mapa).sort((a, b) => b.valor - a.valor)
  }, [todosLancamentos])

  // Resumo por veículo dentro do filtro atual
  const resumoPorVeiculo = useMemo(() => {
    const mapa: Record<string, { placa: string; modelo: string; valor: number; litros: number; qtd: number }> = {}
    lancamentosFiltrados.forEach(l => {
      if (!mapa[l.placaLida]) {
        mapa[l.placaLida] = { placa: l.placaLida, modelo: l.modelo || '', valor: 0, litros: 0, qtd: 0 }
      }
      mapa[l.placaLida].valor += l.valor
      mapa[l.placaLida].litros += l.litros
      mapa[l.placaLida].qtd += 1
    })
    return Object.values(mapa).sort((a, b) => b.valor - a.valor)
  }, [lancamentosFiltrados])

  const totalValor = lancamentosFiltrados.reduce((s, l) => s + l.valor, 0)
  const totalLitros = lancamentosFiltrados.reduce((s, l) => s + l.litros, 0)
  const totalGeral = todosLancamentos.reduce((s, l) => s + l.valor, 0)
  const totalLitrosGeral = todosLancamentos.reduce((s, l) => s + l.litros, 0)

  const temFiltro = responsavelSel || placaSel || dataInicio || dataFim

  const handleExportar = () => {
    const { exportarXLSX } = require('@/lib/exportar')
    const sufixo = responsavelSel
      ? responsavelSel.split(' ')[0]
      : placaSel || 'todos'
    exportarXLSX(
      `terceiros-${sufixo}-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`,
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
      ['Responsável', 'Veículos', 'Abastecimentos', 'Litros', 'Valor Total (R$)'],
      resumoPorResponsavel.map(r => [
        r.responsavel,
        r.placas.size,
        r.qtd,
        parseFloat(r.litros.toFixed(3)),
        parseFloat(r.valor.toFixed(2)),
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
          <div className="card-label">Responsáveis</div>
          <div className="card-valor">{resumoPorResponsavel.length}</div>
        </div>
        <div className="card">
          <div className="card-label">Total abastecimentos</div>
          <div className="card-valor">{todosLancamentos.length}</div>
        </div>
      </div>

      {/* ── Resumo por responsável ── */}
      <div className="tabela-hist-wrap" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div className="grafico-titulo" style={{ margin: 0 }}>Resumo por responsável</div>
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
              <th>Responsável</th>
              <th>Veículos</th>
              <th>Abastecimentos</th>
              <th>Litros</th>
              <th>Total (R$)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {resumoPorResponsavel.map(r => (
              <tr
                key={r.responsavel}
                style={{ cursor: 'pointer', background: responsavelSel === r.responsavel ? '#fef3c7' : undefined }}
                onClick={() => {
                  if (responsavelSel === r.responsavel) {
                    setResponsavelSel('')
                    setPlacaSel('')
                  } else {
                    setResponsavelSel(r.responsavel)
                    setPlacaSel('')
                  }
                }}
              >
                <td><strong>{r.responsavel}</strong></td>
                <td>{r.placas.size}</td>
                <td>{r.qtd}</td>
                <td>{fmtL(r.litros)}</td>
                <td style={{ fontWeight: 600, color: '#dc2626' }}>{fmt(r.valor)}</td>
                <td style={{ fontSize: 12, color: 'var(--sky)' }}>
                  {responsavelSel === r.responsavel ? '▲ ocultar' : '▼ filtrar'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Filtros ── */}
      <div className="filtros-veiculo" style={{ marginBottom: '1.5rem' }}>
        <div className="filtro-grupo">
          <label className="filtro-label">Responsável</label>
          <select className="filtro-select-lg" value={responsavelSel} onChange={e => { setResponsavelSel(e.target.value); setPlacaSel('') }}>
            <option value="">Todos os responsáveis</option>
            {responsaveis.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="filtro-grupo">
          <label className="filtro-label">Veículo</label>
          <select className="filtro-select-lg" value={placaSel} onChange={e => setPlacaSel(e.target.value)}>
            <option value="">Todos os veículos</option>
            {veiculos.map(v => (
              <option key={v.placa} value={v.placa}>{v.placa}</option>
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
        {temFiltro && (
          <button className="btn-limpar" onClick={() => { setResponsavelSel(''); setPlacaSel(''); setDataInicio(''); setDataFim('') }}>
            Limpar filtros
          </button>
        )}
      </div>

      {/* ── Header responsável selecionado ── */}
      {responsavelSel && lancamentosFiltrados.length > 0 && (
        <div style={{
          background: '#fef3c7', border: '1px solid #fcd34d',
          borderRadius: 10, padding: '0.75rem 1rem',
          marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>👤</span>
          <div>
            <div style={{ fontWeight: 700, color: '#92400e', fontSize: 15 }}>{responsavelSel}</div>
            <div style={{ fontSize: 12, color: '#b45309' }}>
              {veiculos.length} veículo{veiculos.length !== 1 ? 's' : ''}: {veiculos.map(v => v.placa).join(', ')}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontWeight: 700, color: '#dc2626', fontSize: 18 }}>{fmt(totalValor)}</div>
            <div style={{ fontSize: 12, color: '#b45309' }}>{fmtL(totalLitros)} · {lancamentosFiltrados.length} abastecimentos</div>
          </div>
        </div>
      )}

      {/* ── Cards do filtro atual ── */}
      {temFiltro && !responsavelSel && lancamentosFiltrados.length > 0 && (
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

      {/* ── Resumo por veículo quando filtrado por responsável com múltiplas placas ── */}
      {responsavelSel && resumoPorVeiculo.length > 1 && (
        <div className="tabela-hist-wrap" style={{ marginBottom: '1.5rem' }}>
          <div className="grafico-titulo" style={{ marginBottom: '0.75rem' }}>
            Veículos de {responsavelSel.split(' ')[0]}
          </div>
          <table className="tabela tabela-sm">
            <thead>
              <tr><th>Placa</th><th>Abastecimentos</th><th>Litros</th><th>Total (R$)</th></tr>
            </thead>
            <tbody>
              {resumoPorVeiculo.map(v => (
                <tr
                  key={v.placa}
                  style={{ cursor: 'pointer', background: placaSel === v.placa ? '#eff6ff' : undefined }}
                  onClick={() => setPlacaSel(placaSel === v.placa ? '' : v.placa)}
                >
                  <td><strong>{v.placa}</strong></td>
                  <td>{v.qtd}</td>
                  <td>{fmtL(v.litros)}</td>
                  <td style={{ fontWeight: 600, color: '#dc2626' }}>{fmt(v.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Tabela de lançamentos ── */}
      <div className="tabela-hist-wrap">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div className="grafico-titulo" style={{ margin: 0 }}>
            {responsavelSel
              ? `Abastecimentos — ${responsavelSel}`
              : placaSel
              ? `Histórico — ${placaSel}`
              : 'Todos os abastecimentos'}
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
