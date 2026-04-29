'use client'
import { useState } from 'react'
import type { TipoServicoContrato, TipoAditamento, ItemContrato } from '@/lib/contratos-types'
import { TIPOS_SERVICO, rotuloTipoAditamento, corTipoAditamento } from '@/lib/contratos-types'

interface Props {
  dados: {
    contemAditamentos: boolean
    contrato: any
    aditamentos: any[]
    file: File
  }
  onCancelar: () => void
  onConfirmar: (dadosFinais: { contrato: any; aditamentos: any[] }) => Promise<void>
}

// ============================================================
// PALETA DARK PREMIUM AZUL
// ============================================================
const C = {
  bg: '#0a0f1f',
  bgPanel: '#0f1830',
  bgPanel2: '#152340',
  bgPanel3: '#1c2d50',
  border: '#1e2d4f',
  borderStrong: '#2a3d68',
  ink: '#e8edf7',
  ink2: '#aab5cc',
  muted: '#6b7896',
  muted2: '#475066',
  accent: '#4a9eff',
  accent2: '#6db3ff',
  accent3: '#2a7fd9',
  gold: '#d4b86a',
  red: '#f87171',
  amber: '#fbbf24',
  green: '#3ecf8e',
  violet: '#a78bfa',
  teal: '#14b8a6',
}

const fmtReal = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtReal4 = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })
const fmtNum = (n: number) => n.toLocaleString('pt-BR')

const fmtData = (iso: string | undefined) => {
  if (!iso) return '—'
  const p = iso.split('-')
  if (p.length !== 3) return iso
  return `${p[2]}/${p[1]}/${p[0]}`
}

export default function PreviaImportacao({ dados, onCancelar, onConfirmar }: Props) {
  const [contrato, setContrato] = useState<any>(dados.contrato || {})
  const [aditamentos, setAditamentos] = useState<any[]>(dados.aditamentos || [])
  const [salvando, setSalvando] = useState(false)
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set())

  const totalOriginal = Number(contrato?.valorTotal) || 0
  const ultimoAd = aditamentos.length > 0 ? aditamentos[aditamentos.length - 1] : null
  const totalAtual = ultimoAd?.novoValorTotal != null ? Number(ultimoAd.novoValorTotal) : totalOriginal

  const atualizarContrato = (campo: string, valor: any) => {
    setContrato({ ...contrato, [campo]: valor })
  }

  const atualizarAditamento = (idx: number, campo: string, valor: any) => {
    const novo = [...aditamentos]
    novo[idx] = { ...novo[idx], [campo]: valor }
    setAditamentos(novo)
  }

  const removerAditamento = (idx: number) => {
    if (!confirm('Remover este aditamento da importação?')) return
    setAditamentos(aditamentos.filter((_, i) => i !== idx))
  }

  const toggleExpandir = (idx: number) => {
    const novo = new Set(expandidos)
    if (novo.has(idx)) novo.delete(idx); else novo.add(idx)
    setExpandidos(novo)
  }

  const confirmar = async () => {
    if (!contrato.cliente && !contrato.contratante) {
      alert('Informe pelo menos o Contratante')
      return
    }
    if (!contrato.dataVencimento && (!aditamentos.length || !aditamentos[aditamentos.length - 1]?.novaDataVencimento)) {
      alert('Informe a data de vencimento do contrato')
      return
    }
    setSalvando(true)
    try {
      await onConfirmar({
        contrato: {
          ...contrato,
          cliente: contrato.cliente || contrato.contratante,
          valorTotalOriginal: contrato.valorTotal,
        },
        aditamentos,
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.78)',
      backdropFilter: 'blur(4px)',
      zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, overflowY: 'auto',
    }}>
      <div style={{
        background: C.bgPanel, borderRadius: 12, width: '100%', maxWidth: 900,
        maxHeight: '92vh', overflowY: 'auto',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        color: C.ink,
        border: `1px solid ${C.borderStrong}`,
        boxShadow: `0 20px 80px rgba(0,0,0,0.6), 0 0 0 1px ${C.violet}30`,
      }}>
        {/* Cabeçalho */}
        <div style={{
          padding: '18px 22px', borderBottom: `1px solid ${C.border}`,
          position: 'sticky', top: 0, background: C.bgPanel, zIndex: 1,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 12, flexWrap: 'wrap',
        }}>
          <div>
            <h2 style={{
              margin: 0, fontSize: 18, color: C.ink,
              fontWeight: 700, letterSpacing: '-0.01em',
            }}>
              ✨ Prévia da importação
            </h2>
            <div style={{ fontSize: 12, color: C.ink2, marginTop: 4 }}>
              Revise os dados extraídos pela IA e edite o que precisar antes de salvar.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: C.violet,
              background: `${C.violet}15`,
              border: `1px solid ${C.violet}40`,
              padding: '5px 12px', borderRadius: 4, letterSpacing: 0.4,
            }}>
              1 CONTRATO + {aditamentos.length} {aditamentos.length === 1 ? 'ADITAMENTO' : 'ADITAMENTOS'}
            </span>
          </div>
        </div>

        {/* Resumo em destaque */}
        <div style={{
          margin: 22, padding: 18,
          background: `${C.green}08`,
          border: `1px solid ${C.green}40`,
          borderLeft: `3px solid ${C.green}`,
          borderRadius: 10,
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 1,
            background: `linear-gradient(90deg, transparent, ${C.green}80 50%, transparent)`,
          }} />
          <div>
            <div style={{
              fontSize: 10, color: C.green, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>CONTRATANTE</div>
            <div style={{
              fontSize: 14, fontWeight: 700, color: C.ink,
              marginTop: 4,
            }}>
              {contrato?.contratante || contrato?.cliente || '—'}
            </div>
          </div>
          <div>
            <div style={{
              fontSize: 10, color: C.green, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>VALOR ATUAL</div>
            <div style={{
              fontSize: 16, fontWeight: 700, color: C.green,
              marginTop: 4, fontFamily: 'monospace', letterSpacing: '-0.025em',
            }}>
              {fmtReal(totalAtual)}
            </div>
            {totalOriginal > 0 && totalOriginal !== totalAtual && (
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2, fontFamily: 'monospace' }}>
                original: {fmtReal(totalOriginal)}
              </div>
            )}
          </div>
          <div>
            <div style={{
              fontSize: 10, color: C.green, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>VENCIMENTO VIGENTE</div>
            <div style={{
              fontSize: 14, fontWeight: 700, color: C.ink,
              marginTop: 4, fontFamily: 'monospace',
            }}>
              {fmtData(ultimoAd?.novaDataVencimento || contrato?.dataVencimento)}
            </div>
          </div>
        </div>

        {/* CONTRATO ORIGINAL */}
        <div style={{ padding: '0 22px' }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: C.ink,
            padding: '10px 0', borderBottom: `2px solid ${C.accent}`,
            marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          }}>
            <span style={{
              fontSize: 10,
              background: `linear-gradient(135deg, ${C.accent} 0%, ${C.accent3} 100%)`,
              color: '#fff',
              padding: '4px 10px', borderRadius: 4, letterSpacing: 0.4,
              boxShadow: `0 2px 8px ${C.accent}40`,
            }}>CONTRATO ORIGINAL</span>
            {contrato?.dataInicio && (
              <span style={{ fontSize: 12, color: C.ink2, fontWeight: 500 }}>
                Assinado em <span style={{ fontFamily: 'monospace', color: C.ink }}>{fmtData(contrato.dataInicio)}</span>
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            <Campo label="Contratante *">
              <input value={contrato.contratante || ''} onChange={e => atualizarContrato('contratante', e.target.value)} style={inputStyle} />
            </Campo>

            <div style={grid2}>
              <Campo label="Número do contrato">
                <input value={contrato.numero || ''} onChange={e => atualizarContrato('numero', e.target.value)} style={inputStyle} />
              </Campo>
              <Campo label="CNPJ do contratante">
                <input value={contrato.cnpjContratante || ''} onChange={e => atualizarContrato('cnpjContratante', e.target.value)} style={inputStyle} />
              </Campo>
            </div>

            <div style={grid2}>
              <Campo label="Cidade">
                <input value={contrato.cidade || ''} onChange={e => atualizarContrato('cidade', e.target.value)} style={inputStyle} />
              </Campo>
              <Campo label="Tipo de serviço">
                <select value={contrato.tipoServico || 'Transporte Escolar'}
                  onChange={e => atualizarContrato('tipoServico', e.target.value as TipoServicoContrato)} style={inputStyle}>
                  {TIPOS_SERVICO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Campo>
            </div>

            <div style={grid2}>
              <Campo label="Processo administrativo">
                <input value={contrato.processoAdministrativo || ''} onChange={e => atualizarContrato('processoAdministrativo', e.target.value)} style={inputStyle} />
              </Campo>
              <Campo label="Modalidade de licitação">
                <input value={contrato.modalidadeLicitacao || ''} onChange={e => atualizarContrato('modalidadeLicitacao', e.target.value)} style={inputStyle} />
              </Campo>
            </div>

            <div style={grid2}>
              <Campo label="Data de início">
                <input type="date" value={contrato.dataInicio || ''} onChange={e => atualizarContrato('dataInicio', e.target.value)} style={inputStyle} />
              </Campo>
              <Campo label="Data de vencimento original">
                <input type="date" value={contrato.dataVencimento || ''} onChange={e => atualizarContrato('dataVencimento', e.target.value)} style={inputStyle} />
              </Campo>
            </div>

            <Campo label="Valor total original (R$)">
              <input value={contrato.valorTotal || ''} onChange={e => atualizarContrato('valorTotal', e.target.value)} style={inputStyle} />
            </Campo>

            <Campo label="Objeto do contrato">
              <textarea value={contrato.objeto || ''} onChange={e => atualizarContrato('objeto', e.target.value)}
                style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} />
            </Campo>

            <Campo label="Cláusula de reajuste">
              <input value={contrato.clausulaReajuste || ''} onChange={e => atualizarContrato('clausulaReajuste', e.target.value)}
                style={inputStyle} placeholder="ex.: IPCA/IBGE acumulado 12 meses" />
            </Campo>

            {/* Itens originais */}
            {Array.isArray(contrato.itens) && contrato.itens.length > 0 && (
              <div style={{
                background: C.bgPanel2,
                border: `1px solid ${C.border}`,
                borderRadius: 8, overflow: 'hidden',
              }}>
                <div style={{
                  padding: '12px 14px',
                  background: C.bgPanel3,
                  fontSize: 11, fontWeight: 700,
                  color: C.ink2,
                  borderBottom: `1px solid ${C.border}`,
                  letterSpacing: 0.4, textTransform: 'uppercase',
                }}>
                  ITENS ORIGINAIS ({contrato.itens.length})
                </div>
                <TabelaItens itens={contrato.itens} />
              </div>
            )}
          </div>
        </div>

        {/* ADITAMENTOS */}
        {aditamentos.length > 0 && (
          <div style={{ padding: '28px 22px 0' }}>
            <div style={{
              fontSize: 13, fontWeight: 700, color: C.ink,
              padding: '10px 0', borderBottom: `2px solid ${C.violet}`,
              marginBottom: 14,
            }}>
              <span style={{
                fontSize: 10,
                background: `linear-gradient(135deg, ${C.violet} 0%, #7c3aed 100%)`,
                color: '#fff',
                padding: '4px 10px', borderRadius: 4, letterSpacing: 0.4,
                boxShadow: `0 2px 8px ${C.violet}40`,
              }}>{aditamentos.length} TERMO{aditamentos.length > 1 ? 'S' : ''} DE ADITAMENTO</span>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              {aditamentos.map((ad, idx) => {
                const corTipo = corTipoAditamento(ad.tipo || 'misto')
                const aberto = expandidos.has(idx)
                return (
                  <div key={idx} style={{
                    background: C.bgPanel2,
                    border: `1px solid ${C.border}`,
                    borderLeft: `3px solid ${corTipo}`,
                    borderRadius: 8, overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '14px 16px', display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, color: '#fff',
                            background: corTipo, padding: '3px 10px', borderRadius: 4,
                            letterSpacing: 0.4, boxShadow: `0 2px 6px ${corTipo}40`,
                          }}>{idx + 1}º TA · {rotuloTipoAditamento(ad.tipo || 'misto')}</span>
                          {ad.data && (
                            <span style={{
                              fontSize: 12, color: C.ink2, fontWeight: 600,
                              fontFamily: 'monospace',
                            }}>{fmtData(ad.data)}</span>
                          )}
                          {ad.percentualReajuste != null && (
                            <span style={{
                              fontSize: 11, fontWeight: 600, color: C.accent2,
                              background: `${C.accent}15`,
                              border: `1px solid ${C.accent}40`,
                              padding: '3px 10px', borderRadius: 4,
                            }}>
                              {Number(ad.percentualReajuste).toFixed(2).replace('.', ',')}% {ad.indiceReajuste || ''}
                            </span>
                          )}
                        </div>
                        {ad.observacoes && (
                          <div style={{ fontSize: 12, color: C.ink2, marginTop: 6 }}>{ad.observacoes}</div>
                        )}
                        {ad.novoValorTotal != null && (
                          <div style={{
                            fontSize: 13, color: C.green, fontWeight: 600,
                            marginTop: 6, fontFamily: 'monospace',
                          }}>
                            Novo valor total: {fmtReal(Number(ad.novoValorTotal))}
                            {ad.novaDataVencimento && (
                              <span style={{ color: C.ink2 }}> • Novo vencimento: {fmtData(ad.novaDataVencimento)}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" onClick={() => toggleExpandir(idx)} style={miniBtn(C.ink2)}>
                          {aberto ? '▲ Fechar' : '▼ Editar'}
                        </button>
                        <button type="button" onClick={() => removerAditamento(idx)} style={miniBtn(C.red)}>
                          Remover
                        </button>
                      </div>
                    </div>

                    {aberto && (
                      <div style={{
                        padding: '0 16px 16px',
                        borderTop: `1px solid ${C.border}`,
                        background: C.bgPanel,
                      }}>
                        <div style={{ display: 'grid', gap: 10, paddingTop: 14 }}>
                          <div style={grid2}>
                            <Campo label="Data de assinatura">
                              <input type="date" value={ad.data || ''}
                                onChange={e => atualizarAditamento(idx, 'data', e.target.value)} style={inputStyle} />
                            </Campo>
                            <Campo label="Tipo">
                              <select value={ad.tipo || 'misto'}
                                onChange={e => atualizarAditamento(idx, 'tipo', e.target.value as TipoAditamento)} style={inputStyle}>
                                <option value="reajuste">Reajuste</option>
                                <option value="acrescimo">Acréscimo</option>
                                <option value="supressao">Supressão</option>
                                <option value="prorrogacao">Prorrogação</option>
                                <option value="misto">Misto</option>
                              </select>
                            </Campo>
                          </div>
                          <div style={grid2}>
                            <Campo label="Nova data de vencimento">
                              <input type="date" value={ad.novaDataVencimento || ''}
                                onChange={e => atualizarAditamento(idx, 'novaDataVencimento', e.target.value)} style={inputStyle} />
                            </Campo>
                            <Campo label="Novo valor total (R$)">
                              <input value={ad.novoValorTotal || ''}
                                onChange={e => atualizarAditamento(idx, 'novoValorTotal', e.target.value)} style={inputStyle} />
                            </Campo>
                          </div>
                          <div style={grid2}>
                            <Campo label="% Reajuste">
                              <input value={ad.percentualReajuste || ''}
                                onChange={e => atualizarAditamento(idx, 'percentualReajuste', e.target.value)} style={inputStyle}
                                placeholder="ex: 4.56" />
                            </Campo>
                            <Campo label="Índice">
                              <input value={ad.indiceReajuste || ''}
                                onChange={e => atualizarAditamento(idx, 'indiceReajuste', e.target.value)} style={inputStyle}
                                placeholder="IPCA" />
                            </Campo>
                          </div>
                          <Campo label="Observações">
                            <textarea value={ad.observacoes || ''}
                              onChange={e => atualizarAditamento(idx, 'observacoes', e.target.value)}
                              style={{ ...inputStyle, minHeight: 44, resize: 'vertical' }} />
                          </Campo>
                        </div>
                      </div>
                    )}

                    {/* Itens resultantes */}
                    {Array.isArray(ad.itensResultantes) && ad.itensResultantes.length > 0 && (
                      <div style={{
                        background: C.bgPanel,
                        borderTop: `1px solid ${C.border}`,
                      }}>
                        <div style={{
                          padding: '10px 14px', fontSize: 11, fontWeight: 700,
                          color: C.ink2, background: C.bgPanel3,
                          letterSpacing: 0.4, textTransform: 'uppercase',
                          borderBottom: `1px solid ${C.border}`,
                        }}>
                          ESTADO APÓS ESTE ADITAMENTO · {ad.itensResultantes.length} {ad.itensResultantes.length === 1 ? 'ITEM' : 'ITENS'}
                        </div>
                        <TabelaItens itens={ad.itensResultantes} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Rodapé com botões */}
        <div style={{
          padding: '16px 22px',
          borderTop: `1px solid ${C.border}`,
          marginTop: 22,
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          position: 'sticky', bottom: 0, background: C.bgPanel,
        }}>
          <button type="button" onClick={onCancelar} disabled={salvando} style={{
            padding: '10px 18px', background: C.bgPanel3, color: C.ink2,
            border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: salvando ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}>Cancelar</button>
          <button type="button" onClick={confirmar} disabled={salvando} style={{
            padding: '10px 22px',
            background: salvando
              ? C.bgPanel3
              : `linear-gradient(135deg, ${C.green} 0%, #047857 100%)`,
            color: salvando ? C.muted : '#fff',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
            cursor: salvando ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            boxShadow: salvando ? 'none' : `0 4px 12px ${C.green}40`,
          }}>
            {salvando ? 'Salvando...' : `✓ Confirmar e salvar${aditamentos.length > 0 ? ` (1 contrato + ${aditamentos.length} ${aditamentos.length === 1 ? 'aditamento' : 'aditamentos'})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

const TabelaItens = ({ itens }: { itens: ItemContrato[] }) => (
  <div style={{ overflowX: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{
          background: C.bgPanel2, color: C.muted,
          fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4,
        }}>
          <th style={thStyle}>#</th>
          <th style={thStyle}>Descrição</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Qtd</th>
          <th style={thStyle}>Unid</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Valor Unit.</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Valor Total</th>
        </tr>
      </thead>
      <tbody>
        {itens.map((it, idx) => (
          <tr key={idx} style={{ borderTop: `1px solid ${C.border}` }}>
            <td style={{ ...tdStyle, color: C.muted, fontFamily: 'monospace' }}>{String(idx + 1).padStart(2, '0')}</td>
            <td style={{ ...tdStyle, fontWeight: 600, color: C.ink }}>{it.descricao}</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>{it.quantidade != null ? fmtNum(it.quantidade) : '—'}</td>
            <td style={tdStyle}>{it.unidade || '—'}</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace' }}>{it.valorUnitario != null ? fmtReal4(it.valorUnitario) : '—'}</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: C.ink, fontFamily: 'monospace' }}>{it.valorTotal != null ? fmtReal(it.valorTotal) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

const Campo = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: 'block' }}>
    <div style={{
      fontSize: 11, color: C.ink2, fontWeight: 600, marginBottom: 5,
      textTransform: 'uppercase', letterSpacing: 0.4,
    }}>{label}</div>
    {children}
  </label>
)

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  border: `1px solid ${C.border}`,
  borderRadius: 6, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box',
  background: C.bgPanel2,
  color: C.ink,
}

const grid2: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10,
}

const miniBtn = (cor: string): React.CSSProperties => ({
  padding: '5px 12px', background: 'transparent', color: cor,
  border: `1px solid ${cor}40`, borderRadius: 5, fontSize: 11, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
})

const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
  padding: '8px 10px', color: C.ink2,
}
