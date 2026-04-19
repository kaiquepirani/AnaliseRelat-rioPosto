'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Colaborador, Cidade } from '@/lib/dp-types'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const CIDADES_ORDEM: Cidade[] = [
  'Águas de Lindóia (Folha)', 'Águas de Lindóia (Diárias)', 'Morungaba',
  'Mogi Mirim', 'Itapira (Escolar)', 'Itapira (Saúde)', 'Aguaí',
  'Casa Branca', 'Pinhal', 'Ubatuba', 'Porto Ferreira', 'Lindóia', 'Mococa', 'Rio Claro',
]

interface Fechamento {
  id: string
  mesAno: string
  tipo: 'antecipacao' | 'folha'
  totalGeral: number
  totalPorCidade: Record<string, number>
  valorPorColaborador?: Record<string, number>
  arquivo: string
  dataImport: string
}

function mesAnoAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function labelMesAno(ma: string) {
  const [ano, mes] = ma.split('-')
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  return `${nomes[parseInt(mes) - 1]}/${ano}`
}

function mesAnoAnterior(ma: string) {
  const [ano, mes] = ma.split('-').map(Number)
  if (mes === 1) return `${ano - 1}-12`
  return `${ano}-${String(mes - 1).padStart(2, '0')}`
}

export default function ControlePagamentos({ onReimportar }: { onReimportar?: (mesAno: string) => void }) {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([])
  const [mesAno, setMesAno] = useState(mesAnoAtual())
  const [carregando, setCarregando] = useState(true)
  const [cidadeExpandida, setCidadeExpandida] = useState<Cidade | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [colabs, fechs] = await Promise.all([
      fetch('/api/dp/colaboradores').then(r => r.json()),
      fetch('/api/dp/fechamentos').then(r => r.json()),
    ])
    setColaboradores(colabs)
    setFechamentos(fechs)
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const fechAntecip = useMemo(() =>
    fechamentos.find(f => f.mesAno === mesAno && f.tipo === 'antecipacao'),
  [fechamentos, mesAno])

  const fechFolha = useMemo(() =>
    fechamentos.find(f => f.mesAno === mesAno && f.tipo === 'folha'),
  [fechamentos, mesAno])

  const totalAntecip = fechAntecip?.totalGeral ?? null
  const totalFolha   = fechFolha?.totalGeral ?? null
  const totalMes     = (totalAntecip ?? 0) + (totalFolha ?? 0)

  const porCidade = useMemo(() => {
    return CIDADES_ORDEM.map(cidade => {
      const membros = colaboradores.filter(c => c.cidade === cidade && c.status === 'ativo')
      const antecip = fechAntecip?.totalPorCidade?.[cidade] ?? null
      const folha   = fechFolha?.totalPorCidade?.[cidade] ?? null
      return { cidade, membros, antecip, folha }
    }).filter(g => g.membros.length > 0 || g.antecip !== null || g.folha !== null)
  }, [colaboradores, fechAntecip, fechFolha])

  const mesesDisponiveis = useMemo(() => {
    const lista: string[] = []
    let ma = mesAnoAtual()
    for (let i = 0; i < 24; i++) { lista.push(ma); ma = mesAnoAnterior(ma) }
    return lista
  }, [])

  const inputStyle = { padding: '0.4rem 0.7rem', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text)' }
  const semDados = !fechAntecip && !fechFolha

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── Seletor de mês ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.875rem 1rem', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', boxShadow: 'var(--shadow-sm)' }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Competência:</label>
        <select value={mesAno} onChange={e => setMesAno(e.target.value)} style={{ ...inputStyle, fontSize: 13, fontWeight: 600 }}>
          {mesesDisponiveis.map(ma => <option key={ma} value={ma}>{labelMesAno(ma)}</option>)}
        </select>

        {onReimportar && (
          <button onClick={() => onReimportar(mesAno)} style={{ padding: '0.4rem 0.875rem', fontSize: 12, fontWeight: 600, background: 'var(--sky-light)', color: 'var(--navy)', border: '1px solid var(--sky-mid)', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Reimportar folha
          </button>
        )}

        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
          Antecipação: dia 20/{mesAno.split('-')[1]} · Complemento: dia 10/{String(parseInt(mesAno.split('-')[1]) % 12 + 1).padStart(2, '0')}
        </div>
      </div>

      {/* ── Aviso sem dados ── */}
      {semDados && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '0.875rem 1rem', display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: '#92400e' }}>
          <span style={{ fontSize: 18 }}>📂</span>
          <div>
            <strong>Nenhuma folha importada para {labelMesAno(mesAno)}.</strong>
            <span style={{ color: '#b45309', marginLeft: 6 }}>Importe a planilha para ver os valores.</span>
          </div>
        </div>
      )}

      {/* ── 3 Cards principais ── */}
      <div className="cards-grid">

        {/* Card 1 — Antecipação Salarial */}
        <div className="card" style={{ borderColor: totalAntecip ? '#fcd34d' : undefined }}>
          <div className="card-label">💰 Antecipação Salarial</div>
          {totalAntecip ? (
            <>
              <div className="card-valor" style={{ fontSize: 20, color: '#d97706' }}>{fmt(totalAntecip)}</div>
              <div className="card-sub">
                dia 20/{mesAno.split('-')[1]} · {fechAntecip && new Date(fechAntecip.dataImport).toLocaleDateString('pt-BR')}
              </div>
            </>
          ) : (
            <>
              <div className="card-valor" style={{ fontSize: 16, color: 'var(--text-3)' }}>—</div>
              <div className="card-sub" style={{ color: '#d97706' }}>aguardando importação</div>
            </>
          )}
        </div>

        {/* Card 2 — Complemento Salarial */}
        <div className="card" style={{ borderColor: totalFolha ? '#86efac' : undefined }}>
          <div className="card-label">📋 Complemento Salarial</div>
          {totalFolha ? (
            <>
              <div className="card-valor" style={{ fontSize: 20, color: '#16a34a' }}>{fmt(totalFolha)}</div>
              <div className="card-sub">
                dia 10/{String(parseInt(mesAno.split('-')[1]) % 12 + 1).padStart(2, '0')} · {fechFolha && new Date(fechFolha.dataImport).toLocaleDateString('pt-BR')}
              </div>
            </>
          ) : (
            <>
              <div className="card-valor" style={{ fontSize: 16, color: 'var(--text-3)' }}>—</div>
              <div className="card-sub" style={{ color: '#16a34a' }}>importar folha do mês seguinte</div>
            </>
          )}
        </div>

        {/* Card 3 — Total do Mês */}
        <div className="card" style={{ background: totalMes > 0 ? 'var(--navy)' : undefined, border: 'none', gridColumn: '1 / -1' }}>
          <div className="card-label" style={{ color: totalMes > 0 ? 'rgba(255,255,255,0.6)' : undefined }}>
            🏦 Total Pago em {labelMesAno(mesAno)}
          </div>
          {totalMes > 0 ? (
            <>
              <div className="card-valor" style={{ fontSize: 26, color: '#4AABDB' }}>{fmt(totalMes)}</div>
              <div className="card-sub" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {totalAntecip ? `Antecipação ${fmt(totalAntecip)}` : ''}
                {totalAntecip && totalFolha ? ' + ' : ''}
                {totalFolha ? `Complemento ${fmt(totalFolha)}` : ''}
              </div>
            </>
          ) : (
            <>
              <div className="card-valor" style={{ fontSize: 18, color: 'var(--text-3)' }}>—</div>
              <div className="card-sub">nenhuma folha importada</div>
            </>
          )}
        </div>
      </div>

      {/* ── Lista por cidade ── */}
      {carregando ? (
        <div className="estado-vazio">Carregando...</div>
      ) : porCidade.length === 0 ? (
        <div className="estado-vazio">
          <div className="estado-icone">📋</div>
          <div className="estado-titulo">Nenhum colaborador ativo</div>
          <div className="estado-desc">Importe uma folha Excel para começar</div>
        </div>
      ) : (
        porCidade.map(({ cidade, membros, antecip, folha }) => {
          const aberta = cidadeExpandida === cidade
          const totalCidade = (antecip ?? 0) + (folha ?? 0)
          return (
            <div key={cidade} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>

              {/* Header cidade */}
              <div
                style={{ padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', gap: 12, cursor: membros.length > 0 ? 'pointer' : 'default' }}
                onClick={() => membros.length > 0 && setCidadeExpandida(aberta ? null : cidade)}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{cidade}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{membros.length} colaborador{membros.length !== 1 ? 'es' : ''}</div>
                </div>

                {/* Antecipação */}
                <div style={{ textAlign: 'center', minWidth: 130 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 2 }}>Antecipação</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: antecip ? '#d97706' : 'var(--text-3)' }}>
                    {antecip ? fmt(antecip) : '—'}
                  </div>
                </div>

                <div style={{ width: 1, height: 32, background: 'var(--border)' }} />

                {/* Complemento */}
                <div style={{ textAlign: 'center', minWidth: 130 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 2 }}>Complemento</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: folha ? '#16a34a' : 'var(--text-3)' }}>
                    {folha ? fmt(folha) : '—'}
                  </div>
                </div>

                <div style={{ width: 1, height: 32, background: 'var(--border)' }} />

                {/* Total cidade */}
                <div style={{ textAlign: 'center', minWidth: 130 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 2 }}>Total</div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: totalCidade > 0 ? 'var(--navy)' : 'var(--text-3)' }}>
                    {totalCidade > 0 ? fmt(totalCidade) : '—'}
                  </div>
                </div>

                {membros.length > 0 && (
                  <span style={{ color: 'var(--text-3)', fontSize: 12, marginLeft: 4 }}>{aberta ? '▲' : '▼'}</span>
                )}
              </div>

              {/* Expandido — colaboradores */}
              {aberta && membros.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  <table className="tabela tabela-sm">
                    <thead>
                      <tr>
                        <th>Colaborador</th>
                        <th style={{ textAlign: 'right' }}>A receber</th>
                        <th>Banco / PIX</th>
                      </tr>
                    </thead>
                    <tbody>
                      {membros.map(c => {
                        const nomeKey = c.nome.trim().toUpperCase()
                        const valorReal = fechAntecip?.valorPorColaborador?.[nomeKey]
                        const valorExibir = valorReal ?? c.salarioBase
                        return (
                          <tr key={c.id}>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{c.nome}</div>
                              {c.cpf && <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>{c.cpf}</div>}
                              {c.observacoes && <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 2 }}>📌 {c.observacoes}</div>}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 700, fontSize: 14, color: valorReal ? 'var(--navy)' : 'var(--text-2)' }}>{fmt(valorExibir)}</div>
                              {!valorReal && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>estimado</div>}
                            </td>
                            <td style={{ fontSize: 12 }}>
                              {c.dadosBancarios?.banco && <div>{c.dadosBancarios.banco}</div>}
                              {c.dadosBancarios?.agencia && <div style={{ color: 'var(--text-3)' }}>Ag {c.dadosBancarios.agencia}{c.dadosBancarios.conta ? ` · C ${c.dadosBancarios.conta}` : ''}</div>}
                              {c.dadosBancarios?.pix && <div style={{ color: 'var(--text-3)' }}>PIX: {c.dadosBancarios.pix}</div>}
                              {!c.dadosBancarios?.banco && !c.dadosBancarios?.pix && <span style={{ color: 'var(--text-3)' }}>—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'var(--sky-light)' }}>
                        <td style={{ fontWeight: 700 }}>TOTAL {cidade.toUpperCase()}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--navy)' }}>
                          {antecip ? fmt(antecip) : '—'}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )
        })
      )}

      {/* ── Rodapé total geral ── */}
      {totalMes > 0 && (
        <div style={{ background: 'var(--navy)', borderRadius: 12, padding: '1rem 1.5rem', display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600, flex: 1 }}>TOTAL GERAL — {labelMesAno(mesAno)}</div>
          {totalAntecip && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Antecipação</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fcd34d' }}>{fmt(totalAntecip)}</div>
            </div>
          )}
          {totalAntecip && totalFolha && <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.15)' }} />}
          {totalFolha && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Complemento</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#86efac' }}>{fmt(totalFolha)}</div>
            </div>
          )}
          <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.15)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Total do mês</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#4AABDB' }}>{fmt(totalMes)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
