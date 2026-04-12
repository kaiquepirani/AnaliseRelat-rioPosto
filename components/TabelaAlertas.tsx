'use client'
import { Lancamento } from '@/lib/types'
import { Extrato } from '@/lib/types'
import { useState, useEffect, useCallback, useMemo } from 'react'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function motivoAlerta(l: Lancamento): string {
  if (l.status === 'nao_identificada') {
    return 'Placa não encontrada na relação de frota nem em registros de veículos alugados'
  }
  return ''
}

function chaveJustificativa(l: Lancamento): string {
  return `${l.placaLida}__${l.documento}`
}

export default function TabelaAlertas({ lancamentos, extratos = [] }: { lancamentos: Lancamento[], extratos?: Extrato[] }) {
  const naoIdentificadas = lancamentos.filter(l => l.status === 'nao_identificada')
  const [justificativas, setJustificativas] = useState<Record<string, string>>({})
  const [editando, setEditando] = useState<string | null>(null)
  const [textoEditando, setTextoEditando] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Mapear documento -> nome do posto
  const mapaPostos = useMemo(() => {
    const mapa: Record<string, string> = {}
    extratos.forEach(e => {
      e.postos.forEach(p => {
        p.lancamentos.forEach(l => {
          mapa[`${l.placaLida}__${l.documento}`] = p.nome
        })
      })
    })
    return mapa
  }, [extratos])

  const carregarJustificativas = useCallback(async () => {
    const res = await fetch('/api/justificativas')
    const dados = await res.json()
    setJustificativas(dados)
  }, [])

  useEffect(() => { carregarJustificativas() }, [carregarJustificativas])

  const iniciarEdicao = (chave: string) => {
    setEditando(chave)
    setTextoEditando(justificativas[chave] || '')
  }

  const salvar = async (chave: string) => {
    setSalvando(true)
    await fetch('/api/justificativas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chave, texto: textoEditando }),
    })
    setJustificativas(prev => ({ ...prev, [chave]: textoEditando }))
    setEditando(null)
    setSalvando(false)
  }

  const remover = async (chave: string) => {
    setSalvando(true)
    await fetch('/api/justificativas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chave, texto: '' }),
    })
    setJustificativas(prev => { const n = { ...prev }; delete n[chave]; return n })
    setSalvando(false)
  }

  if (naoIdentificadas.length === 0) {
    return (
      <div className="estado-vazio">
        <div className="estado-icone">✓</div>
        <div className="estado-titulo">Nenhum alerta</div>
        <div className="estado-desc">Todas as placas foram identificadas na frota</div>
      </div>
    )
  }

  const totalValor = naoIdentificadas.reduce((s, l) => s + l.valor, 0)
  const comJustificativa = naoIdentificadas.filter(l => justificativas[chaveJustificativa(l)])
  const semJustificativa = naoIdentificadas.filter(l => !justificativas[chaveJustificativa(l)])

  return (
    <div className="alertas">
      {/* Resumo */}
      <div className="cards-grid">
        <div className="card card-alerta">
          <div className="card-label">Total a investigar</div>
          <div className="card-valor">{naoIdentificadas.length} lançamentos</div>
          <div className="card-sub">{fmt(totalValor)}</div>
        </div>
        <div className={`card ${semJustificativa.length === 0 ? 'card-ok' : 'card-alerta'}`}>
          <div className="card-label">Sem justificativa</div>
          <div className="card-valor">{semJustificativa.length}</div>
          <div className="card-sub">{fmt(semJustificativa.reduce((s, l) => s + l.valor, 0))}</div>
        </div>
        <div className="card card-ok">
          <div className="card-label">Justificados</div>
          <div className="card-valor">{comJustificativa.length}</div>
          <div className="card-sub">{fmt(comJustificativa.reduce((s, l) => s + l.valor, 0))}</div>
        </div>
      </div>

      {/* Lançamentos sem justificativa */}
      {semJustificativa.length > 0 && (
        <div className="alerta-secao">
          <div className="alerta-header alerta-vermelho">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Pendentes de justificativa ({semJustificativa.length} lançamentos · {fmt(semJustificativa.reduce((s, l) => s + l.valor, 0))})
          </div>
          <table className="tabela tabela-sm">
            <thead>
              <tr>
                <th>Placa</th>
                <th>Data</th>
                <th>Posto</th>
                <th>Combustível</th>
                <th>Litros</th>
                <th>Valor</th>
                <th>Documento</th>
                <th>Justificativa</th>
              </tr>
            </thead>
            <tbody>
              {semJustificativa.map((l, i) => {
                const chave = chaveJustificativa(l)
                const posto = mapaPostos[chave] || '—'
                return (
                  <tr key={i} className="tr-vermelho">
                    <td><code>{l.placaLida}</code></td>
                    <td>{l.emissao}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{posto}</td>
                    <td>{l.combustivelNome}</td>
                    <td>{l.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L</td>
                    <td>{fmt(l.valor)}</td>
                    <td><small>{l.documento}</small></td>
                    <td style={{ minWidth: 260 }}>
                      {editando === chave ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                          <textarea
                            autoFocus
                            value={textoEditando}
                            onChange={e => setTextoEditando(e.target.value)}
                            placeholder="Descreva o motivo deste abastecimento..."
                            style={{
                              flex: 1, fontSize: 12, padding: '6px 8px',
                              border: '1px solid var(--border)', borderRadius: 6,
                              fontFamily: 'inherit', resize: 'vertical', minHeight: 60,
                              background: 'white',
                            }}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <button
                              onClick={() => salvar(chave)}
                              disabled={salvando || !textoEditando.trim()}
                              style={{
                                padding: '5px 10px', fontSize: 12, fontWeight: 600,
                                background: 'var(--navy)', color: 'white',
                                border: 'none', borderRadius: 6, cursor: 'pointer',
                                fontFamily: 'inherit', whiteSpace: 'nowrap',
                              }}
                            >Salvar</button>
                            <button
                              onClick={() => setEditando(null)}
                              style={{
                                padding: '5px 10px', fontSize: 12,
                                background: 'var(--bg)', color: 'var(--text-2)',
                                border: '1px solid var(--border)', borderRadius: 6,
                                cursor: 'pointer', fontFamily: 'inherit',
                              }}
                            >Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => iniciarEdicao(chave)}
                          style={{
                            padding: '5px 12px', fontSize: 12, fontWeight: 600,
                            background: 'white', color: 'var(--navy)',
                            border: '1px solid var(--navy)', borderRadius: 6,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >+ Adicionar justificativa</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Lançamentos com justificativa */}
      {comJustificativa.length > 0 && (
        <div className="alerta-secao">
          <div className="alerta-header" style={{ background: 'var(--green-bg)', color: 'var(--green)', borderBottom: '1px solid #86efac' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
            Justificados ({comJustificativa.length} lançamentos · {fmt(comJustificativa.reduce((s, l) => s + l.valor, 0))})
          </div>
          <table className="tabela tabela-sm">
            <thead>
              <tr>
                <th>Placa</th>
                <th>Data</th>
                <th>Posto</th>
                <th>Combustível</th>
                <th>Litros</th>
                <th>Valor</th>
                <th>Documento</th>
                <th>Justificativa</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {comJustificativa.map((l, i) => {
                const chave = chaveJustificativa(l)
                const posto = mapaPostos[chave] || '—'
                return (
                  <tr key={i}>
                    <td><code>{l.placaLida}</code></td>
                    <td>{l.emissao}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{posto}</td>
                    <td>{l.combustivelNome}</td>
                    <td>{l.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L</td>
                    <td>{fmt(l.valor)}</td>
                    <td><small>{l.documento}</small></td>
                    <td style={{ minWidth: 260 }}>
                      {editando === chave ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                          <textarea
                            autoFocus
                            value={textoEditando}
                            onChange={e => setTextoEditando(e.target.value)}
                            style={{
                              flex: 1, fontSize: 12, padding: '6px 8px',
                              border: '1px solid var(--border)', borderRadius: 6,
                              fontFamily: 'inherit', resize: 'vertical', minHeight: 60,
                              background: 'white',
                            }}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <button onClick={() => salvar(chave)} disabled={salvando}
                              style={{ padding: '5px 10px', fontSize: 12, fontWeight: 600, background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}
                            >Salvar</button>
                            <button onClick={() => setEditando(null)}
                              style={{ padding: '5px 10px', fontSize: 12, background: 'var(--bg)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}
                            >Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--text)', background: 'var(--green-bg)', padding: '6px 10px', borderRadius: 6, border: '1px solid #86efac', lineHeight: 1.5 }}>
                          {justificativas[chave]}
                        </div>
                      )}
                    </td>
                    <td>
                      {editando !== chave && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <button onClick={() => iniciarEdicao(chave)}
                            style={{ padding: '4px 8px', fontSize: 11, background: 'var(--bg)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit' }}
                          >Editar</button>
                          <button onClick={() => remover(chave)}
                            style={{ padding: '4px 8px', fontSize: 11, background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid #fca5a5', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit' }}
                          >Remover</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
