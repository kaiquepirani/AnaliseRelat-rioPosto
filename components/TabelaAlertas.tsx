'use client'
import { Lancamento } from '@/lib/types'
import { Extrato } from '@/lib/types'
import { useState, useEffect, useCallback, useMemo } from 'react'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const GRUPO_TERCEIROS = 'Abastecimentos de Terceiros/Vales'

function chaveJustificativa(l: Lancamento): string {
  return `${l.placaLida}__${l.documento}`
}

// Extrai a placa da chave (formato: "PLACA__DOCUMENTO")
function placaDaChave(chave: string): string {
  return chave.split('__')[0] || ''
}

export default function TabelaAlertas({ lancamentos, extratos = [] }: { lancamentos: Lancamento[], extratos?: Extrato[] }) {
  const naoIdentificadas = lancamentos.filter(l => l.status === 'nao_identificada')
  const [justificativas, setJustificativas] = useState<Record<string, string>>({})
  const [editando, setEditando] = useState<string | null>(null)
  const [textoEditando, setTextoEditando] = useState('')
  const [responsavelEditando, setResponsavelEditando] = useState('')
  const [novoResponsavel, setNovoResponsavel] = useState('')
  const [adicionandoResponsavel, setAdicionandoResponsavel] = useState(false)
  const [responsaveisDinamicos, setResponsaveisDinamicos] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)

  // Mapa chave -> { postoNome, placaLida } para garantir que sempre temos a placa
  const mapaLancamentos = useMemo(() => {
    const mapa: Record<string, { postoNome: string; placaLida: string }> = {}
    extratos.forEach(e => {
      e.postos.forEach(p => {
        p.lancamentos.forEach(l => {
          const chave = `${l.placaLida}__${l.documento}`
          mapa[chave] = { postoNome: p.nome, placaLida: l.placaLida }
        })
      })
    })
    return mapa
  }, [extratos])

  const carregarResponsaveis = useCallback(async () => {
    const res = await fetch('/api/frota')
    const frota = await res.json()
    const responsaveis = Array.from(new Set(
      frota
        .filter((v: any) => v.grupo === GRUPO_TERCEIROS && v.modelo)
        .map((v: any) => v.modelo as string)
    )) as string[]
    setResponsaveisDinamicos(responsaveis.sort())
  }, [])

  const carregarJustificativas = useCallback(async () => {
    const res = await fetch('/api/justificativas')
    const dados = await res.json()
    setJustificativas(dados)
  }, [])

  useEffect(() => {
    carregarJustificativas()
    carregarResponsaveis()
  }, [carregarJustificativas, carregarResponsaveis])

  const iniciarEdicao = (chave: string) => {
    setEditando(chave)
    setTextoEditando(justificativas[chave] || '')
    setResponsavelEditando('')
    setNovoResponsavel('')
    setAdicionandoResponsavel(false)
  }

  const confirmarNovoResponsavel = () => {
    const nome = novoResponsavel.trim()
    if (!nome) return
    if (!responsaveisDinamicos.includes(nome)) {
      setResponsaveisDinamicos(prev => [...prev, nome].sort())
    }
    setResponsavelEditando(nome)
    setNovoResponsavel('')
    setAdicionandoResponsavel(false)
  }

  const salvar = async (chave: string) => {
    if (!textoEditando.trim()) return
    setSalvando(true)

    // Placa: tenta do mapa de lançamentos, depois da chave como fallback
    const placaDoMapa = mapaLancamentos[chave]?.placaLida || ''
    const placaDaChaveStr = placaDaChave(chave)
    const placa = (placaDoMapa || placaDaChaveStr).toUpperCase().replace(/[^A-Z0-9]/g, '')

    try {
      // 1. Salvar justificativa
      await fetch('/api/justificativas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chave, texto: textoEditando }),
      })
      setJustificativas(prev => ({ ...prev, [chave]: textoEditando }))

      // 2. Se responsável selecionado E placa válida, cadastrar na frota
      if (responsavelEditando && placa) {
        const novoVeiculo = {
          nFrota: '0',
          placa,
          grupo: GRUPO_TERCEIROS,
          marca: '',
          modelo: responsavelEditando,
        }
        await fetch('/api/frota', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(novoVeiculo),
        })
        await carregarResponsaveis()
      }

      setEditando(null)
      setResponsavelEditando('')
      setNovoResponsavel('')
      setAdicionandoResponsavel(false)
    } finally {
      setSalvando(false)
    }
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

  const exportarExcel = () => {
    const { exportarXLSX } = require('@/lib/exportar')
    exportarXLSX(
      `alertas-placas-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`,
      ['Placa', 'Data', 'Posto', 'Combustível', 'Litros', 'Valor (R$)', 'Documento', 'Status', 'Justificativa'],
      naoIdentificadas.map(l => {
        const chave = chaveJustificativa(l)
        return [
          l.placaLida, l.emissao, mapaLancamentos[chave]?.postoNome || '—', l.combustivelNome,
          parseFloat(l.litros.toFixed(3)),
          parseFloat(l.valor.toFixed(2)),
          l.documento,
          justificativas[chave] ? 'Justificado' : 'Pendente',
          justificativas[chave] || ''
        ]
      }),
      true
    )
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

  // ── Formulário de justificativa ────────────────────────────────────────
  const renderFormEdicao = (chave: string) => {
    const placaDoMapa = mapaLancamentos[chave]?.placaLida || ''
    const placaExibir = placaDoMapa || placaDaChave(chave)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Vincular a Terceiros/Vales */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#92400e', display: 'block', marginBottom: 4 }}>
            Vincular a Terceiros/Vales? <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>(opcional)</span>
          </label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select
              value={responsavelEditando}
              onChange={e => setResponsavelEditando(e.target.value)}
              style={{
                flex: 1, fontSize: 12, padding: '5px 8px',
                border: '1px solid #fcd34d', borderRadius: 6,
                fontFamily: 'inherit', background: '#fffbeb', color: '#92400e',
              }}
            >
              <option value="">— Não vincular —</option>
              {responsaveisDinamicos.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            {/* Botão + para novo responsável */}
            <button
              onClick={() => { setAdicionandoResponsavel(v => !v); setNovoResponsavel('') }}
              title="Adicionar novo responsável"
              style={{
                width: 28, height: 28, borderRadius: 6, border: '1px solid #fcd34d',
                background: adicionandoResponsavel ? '#fde68a' : '#fffbeb',
                color: '#92400e', fontWeight: 700, fontSize: 18,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, lineHeight: 1,
              }}
            >+</button>
          </div>

          {/* Mini-formulário novo responsável */}
          {adicionandoResponsavel && (
            <div style={{
              marginTop: 6, padding: '8px 10px',
              background: '#fffbeb', border: '1px solid #fcd34d',
              borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e' }}>Novo responsável</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  autoFocus
                  value={novoResponsavel}
                  onChange={e => setNovoResponsavel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmarNovoResponsavel(); if (e.key === 'Escape') setAdicionandoResponsavel(false) }}
                  placeholder="Ex: João Silva Ubatuba"
                  style={{
                    flex: 1, fontSize: 12, padding: '5px 8px',
                    border: '1px solid #fcd34d', borderRadius: 6,
                    fontFamily: 'inherit', background: 'white',
                  }}
                />
                <button
                  onClick={confirmarNovoResponsavel}
                  disabled={!novoResponsavel.trim()}
                  style={{
                    padding: '5px 10px', fontSize: 12, fontWeight: 600,
                    background: '#92400e', color: 'white',
                    border: 'none', borderRadius: 6, cursor: 'pointer',
                    fontFamily: 'inherit', opacity: novoResponsavel.trim() ? 1 : 0.5,
                  }}
                >Confirmar</button>
                <button
                  onClick={() => { setAdicionandoResponsavel(false); setNovoResponsavel('') }}
                  style={{
                    padding: '5px 8px', fontSize: 12,
                    background: 'white', color: 'var(--text-2)',
                    border: '1px solid var(--border)', borderRadius: 6,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >✕</button>
              </div>
              <div style={{ fontSize: 11, color: '#b45309' }}>
                O responsável será criado ao salvar a justificativa
              </div>
            </div>
          )}

          {/* Confirmação do vínculo */}
          {responsavelEditando && placaExibir && (
            <div style={{
              fontSize: 11, color: '#92400e', background: '#fef3c7',
              border: '1px solid #fcd34d', borderRadius: 5,
              padding: '4px 8px', marginTop: 4,
            }}>
              ✓ A placa <strong>{placaExibir}</strong> será cadastrada em Terceiros/Vales como <strong>{responsavelEditando}</strong> e não gerará mais alertas
            </div>
          )}
          {responsavelEditando && !placaExibir && (
            <div style={{
              fontSize: 11, color: '#dc2626', background: '#fef2f2',
              border: '1px solid #fca5a5', borderRadius: 5,
              padding: '4px 8px', marginTop: 4,
            }}>
              ⚠️ Placa não identificada — o vínculo não poderá ser cadastrado automaticamente
            </div>
          )}
        </div>

        {/* Textarea justificativa */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <textarea
            value={textoEditando}
            onChange={e => setTextoEditando(e.target.value)}
            placeholder="Descreva o motivo deste abastecimento..."
            style={{
              flex: 1, fontSize: 12, padding: '6px 8px',
              border: '1px solid var(--border)', borderRadius: 6,
              fontFamily: 'inherit', resize: 'vertical', minHeight: 56,
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
                border: 'none', borderRadius: 6,
                cursor: salvando || !textoEditando.trim() ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', whiteSpace: 'nowrap',
                opacity: salvando || !textoEditando.trim() ? 0.6 : 1,
              }}
            >{salvando ? 'Salvando...' : 'Salvar'}</button>
            <button
              onClick={() => { setEditando(null); setResponsavelEditando(''); setAdicionandoResponsavel(false) }}
              style={{
                padding: '5px 10px', fontSize: 12,
                background: 'var(--bg)', color: 'var(--text-2)',
                border: '1px solid var(--border)', borderRadius: 6,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Cancelar</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="alertas">
      {/* Resumo */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 12 }}>
        <div className="cards-grid" style={{ flex: 1, margin: 0 }}>
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
        <button onClick={exportarExcel} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0.6rem 1.1rem', fontSize: 13, fontWeight: 600,
          background: 'var(--navy)', color: 'white',
          border: 'none', borderRadius: 'var(--radius-sm)',
          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', alignSelf: 'flex-start',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar Excel
        </button>
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
                const posto = mapaLancamentos[chave]?.postoNome || '—'
                return (
                  <tr key={i} className="tr-vermelho">
                    <td><code>{l.placaLida || '—'}</code></td>
                    <td>{l.emissao}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{posto}</td>
                    <td>{l.combustivelNome}</td>
                    <td>{l.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L</td>
                    <td>{fmt(l.valor)}</td>
                    <td><small>{l.documento}</small></td>
                    <td style={{ minWidth: 300 }}>
                      {editando === chave
                        ? renderFormEdicao(chave)
                        : (
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
                const posto = mapaLancamentos[chave]?.postoNome || '—'
                return (
                  <tr key={i}>
                    <td><code>{l.placaLida || '—'}</code></td>
                    <td>{l.emissao}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{posto}</td>
                    <td>{l.combustivelNome}</td>
                    <td>{l.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L</td>
                    <td>{fmt(l.valor)}</td>
                    <td><small>{l.documento}</small></td>
                    <td style={{ minWidth: 300 }}>
                      {editando === chave
                        ? renderFormEdicao(chave)
                        : (
                          <div style={{
                            fontSize: 12, color: 'var(--text)',
                            background: 'var(--green-bg)', padding: '6px 10px',
                            borderRadius: 6, border: '1px solid #86efac', lineHeight: 1.5,
                          }}>
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
