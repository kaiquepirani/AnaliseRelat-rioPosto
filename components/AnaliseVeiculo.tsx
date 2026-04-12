'use client'
import { useState, useMemo } from 'react'
import { Extrato, Lancamento } from '@/lib/types'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtL = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L'

function parsarDataBR(data: string): Date | null {
  const m = data.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return null
  let ano = parseInt(m[3])
  if (ano < 100) ano += ano < 50 ? 2000 : 1900
  return new Date(ano, parseInt(m[2]) - 1, parseInt(m[1]))
}

interface LancamentoComInfo extends Lancamento {
  postoNome: string
}

export default function AnaliseVeiculo({ extratos }: { extratos: Extrato[] }) {
  const [placaSel, setPlacaSel] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  // Montar lista de veículos únicos com prefixo+placa
  const veiculos = useMemo(() => {
    const mapa: Record<string, { placa: string; nFrota: string; modelo: string; grupo: string }> = {}
    extratos.forEach(e => {
      e.postos.forEach(p => {
        p.lancamentos.forEach(l => {
          const key = l.placaLida
          if (!mapa[key]) {
            mapa[key] = {
              placa: l.placaLida,
              nFrota: l.nFrota || '',
              modelo: l.modelo ? `${l.marca || ''} ${l.modelo}`.trim() : '',
              grupo: l.grupo || '',
            }
          }
        })
      })
    })
    return Object.values(mapa).sort((a, b) => {
      const ka = `${a.nFrota}-${a.placa}`
      const kb = `${b.nFrota}-${b.placa}`
      return ka.localeCompare(kb)
    })
  }, [extratos])

  // Filtrar lançamentos
  const lancamentosFiltrados = useMemo(() => {
    if (!placaSel) return []
    const resultado: LancamentoComInfo[] = []
    const inicio = dataInicio ? new Date(dataInicio) : null
    const fim = dataFim ? new Date(dataFim + 'T23:59:59') : null

    extratos.forEach(e => {
      e.postos.forEach(p => {
        p.lancamentos.forEach(l => {
          if (l.placaLida !== placaSel) return
          const dataLanc = parsarDataBR(l.emissao)
          if (inicio && dataLanc && dataLanc < inicio) return
          if (fim && dataLanc && dataLanc > fim) return
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
  }, [extratos, placaSel, dataInicio, dataFim])

  const totalValor = lancamentosFiltrados.reduce((s, l) => s + l.valor, 0)
  const totalLitros = lancamentosFiltrados.reduce((s, l) => s + l.litros, 0)

  const porCombustivel: Record<string, { valor: number; litros: number }> = {}
  lancamentosFiltrados.forEach(l => {
    if (!porCombustivel[l.combustivelNome]) porCombustivel[l.combustivelNome] = { valor: 0, litros: 0 }
    porCombustivel[l.combustivelNome].valor += l.valor
    porCombustivel[l.combustivelNome].litros += l.litros
  })

  const veiculoSel = veiculos.find(v => v.placa === placaSel)

  return (
    <div className="analise-veiculo">
      <div className="filtros-veiculo">
        <div className="filtro-grupo">
          <label className="filtro-label">Veículo</label>
          <select className="filtro-select-lg" value={placaSel} onChange={e => setPlacaSel(e.target.value)}>
            <option value="">Selecione um veículo...</option>
            {veiculos.map(v => (
              <option key={v.placa} value={v.placa}>
                {v.nFrota ? `${v.nFrota} — ` : ''}{v.placa}{v.modelo ? ` (${v.modelo})` : ''}
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
        {(dataInicio || dataFim) && (
          <button className="btn-limpar" onClick={() => { setDataInicio(''); setDataFim('') }}>
            Limpar período
          </button>
        )}
      </div>

      {!placaSel && (
        <div className="estado-vazio">
          <div className="estado-icone">↑</div>
          <div className="estado-titulo">Selecione um veículo</div>
          <div className="estado-desc">Escolha o veículo pelo prefixo ou placa para ver o histórico de abastecimentos</div>
        </div>
      )}

      {placaSel && lancamentosFiltrados.length === 0 && (
        <div className="estado-vazio">
          <div className="estado-titulo">Nenhum abastecimento encontrado</div>
          <div className="estado-desc">Tente ajustar o período ou verifique se há extratos carregados para este veículo</div>
        </div>
      )}

      {placaSel && lancamentosFiltrados.length > 0 && (
        <>
          <div className="veiculo-header">
            <div className="veiculo-id">
              <span className="veiculo-placa">{placaSel}</span>
              {veiculoSel?.nFrota && <span className="veiculo-prefixo">Prefixo {veiculoSel.nFrota}</span>}
            </div>
            {veiculoSel?.modelo && <span className="veiculo-modelo">{veiculoSel.modelo}</span>}
            {veiculoSel?.grupo && <span className="veiculo-grupo">{veiculoSel.grupo}</span>}
          </div>

          <div className="cards-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="card">
              <div className="card-label">Total gasto</div>
              <div className="card-valor">{fmt(totalValor)}</div>
            </div>
            <div className="card">
              <div className="card-label">Total litros</div>
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

          {Object.keys(porCombustivel).length > 0 && (
            <div className="tabela-hist-wrap" style={{ marginBottom: '1.5rem' }}>
              <div className="grafico-titulo">Por tipo de combustível</div>
              <table className="tabela">
                <thead><tr><th>Combustível</th><th>Litros</th><th>Valor</th><th>% do total</th></tr></thead>
                <tbody>
                  {Object.entries(porCombustivel).map(([nome, d]) => (
                    <tr key={nome}>
                      <td>{nome}</td>
                      <td>{fmtL(d.litros)}</td>
                      <td>{fmt(d.valor)}</td>
                      <td>{totalValor > 0 ? ((d.valor / totalValor) * 100).toFixed(1) : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="tabela-hist-wrap">
            <div className="grafico-titulo">Histórico de abastecimentos</div>
            <table className="tabela tabela-sm">
              <thead>
                <tr><th>Data</th><th>Posto</th><th>Combustível</th><th>Litros</th><th>Vlr. Unit.</th><th>Valor</th><th>KM</th></tr>
              </thead>
              <tbody>
                {lancamentosFiltrados.map((l, i) => (
                  <tr key={i}>
                    <td>{l.emissao}</td>
                    <td>{l.postoNome}</td>
                    <td>{l.combustivelNome}</td>
                    <td>{fmtL(l.litros)}</td>
                    <td>{l.vlrUnitario > 0 ? `R$ ${l.vlrUnitario.toFixed(3)}` : '—'}</td>
                    <td>{fmt(l.valor)}</td>
                    <td>{l.km?.toLocaleString('pt-BR') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
