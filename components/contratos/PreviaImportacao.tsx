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
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)',
      zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, overflowY: 'auto',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 900,
        maxHeight: '92vh', overflowY: 'auto', fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        {/* Cabeçalho */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid #e5e7eb',
          position: 'sticky', top: 0, background: '#fff', zIndex: 1,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: '#2D3A6B' }}>
              ✨ Prévia da importação
            </h2>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Revise os dados extraídos pela IA e edite o que precisar antes de salvar.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 11, fontWeight: 700, color: '#7c3aed',
              background: '#f5f3ff', border: '1px solid #ddd6fe',
              padding: '4px 10px', borderRadius: 4, letterSpacing: 0.3,
            }}>
              1 CONTRATO + {aditamentos.length} {aditamentos.length === 1 ? 'ADITAMENTO' : 'ADITAMENTOS'}
            </span>
          </div>
        </div>

        {/* Resumo em destaque */}
        <div style={{
          margin: 22, padding: 16, background: '#f0fdf4',
          border: '1px solid #bbf7d0', borderRadius: 10,
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>CONTRATANTE</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#047857', marginTop: 2 }}>
              {contrato?.contratante || contrato?.cliente || '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>VALOR ATUAL</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#047857', marginTop: 2 }}>
              {fmtReal(totalAtual)}
            </div>
            {totalOriginal > 0 && totalOriginal !== totalAtual && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                original: {fmtReal(totalOriginal)}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#166534', fontWeight: 600 }}>VENCIMENTO VIGENTE</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#047857', marginTop: 2 }}>
              {fmtData(ultimoAd?.novaDataVencimento || contrato?.dataVencimento)}
            </div>
          </div>
        </div>

        {/* CONTRATO ORIGINAL */}
        <div style={{ padding: '0 22px' }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: '#1e293b',
            padding: '8px 0', borderBottom: '2px solid #2D3A6B',
            marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{
              fontSize: 10, background: '#2D3A6B', color: '#fff',
              padding: '3px 8px', borderRadius: 4, letterSpacing: 0.3,
            }}>CONTRATO ORIGINAL</span>
            {contrato?.dataInicio && <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Assinado em {fmtData(contrato.dataInicio)}</span>}
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
              <div style={{ background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{
                  padding: '10px 14px', background: '#f1f5f9', fontSize: 12, fontWeight: 700,
                  color: '#334155', borderBottom: '1px solid #e5e7eb',
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
              fontSize: 13, fontWeight: 700, color: '#1e293b',
              padding: '8px 0', borderBottom: '2px solid #7c3aed',
              marginBottom: 12,
            }}>
              <span style={{
                fontSize: 10, background: '#7c3aed', color: '#fff',
                padding: '3px 8px', borderRadius: 4, letterSpacing: 0.3,
              }}>{aditamentos.length} TERMO{aditamentos.length > 1 ? 'S' : ''} DE ADITAMENTO</span>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              {aditamentos.map((ad, idx) => {
                const corTipo = corTipoAditamento(ad.tipo || 'misto')
                const aberto = expandidos.has(idx)
                return (
                  <div key={idx} style={{
                    background: '#fafbff', border: `1px solid #e0e7ff`,
                    borderLeft: `4px solid ${corTipo}`, borderRadius: 8, overflow: 'hidden',
                  }}>
                    <div style={{
                      padding: '12px 16px', display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, color: '#fff',
                            background: corTipo, padding: '3px 8px', borderRadius: 4, letterSpacing: 0.3,
                          }}>{idx + 1}º TA · {rotuloTipoAditamento(ad.tipo || 'misto')}</span>
                          {ad.data && <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{fmtData(ad.data)}</span>}
                          {ad.percentualReajuste != null && (
                            <span style={{
                              fontSize: 11, fontWeight: 600, color: '#1e40af',
                              background: '#eff6ff', border: '1px solid #bfdbfe',
                              padding: '2px 8px', borderRadius: 4,
                            }}>
                              {Number(ad.percentualReajuste).toFixed(2).replace('.', ',')}% {ad.indiceReajuste || ''}
                            </span>
                          )}
                        </div>
                        {ad.observacoes && (
                          <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{ad.observacoes}</div>
                        )}
                        {ad.novoValorTotal != null && (
                          <div style={{ fontSize: 13, color: '#047857', fontWeight: 600, marginTop: 4 }}>
                            Novo valor total: {fmtReal(Number(ad.novoValorTotal))}
                            {ad.novaDataVencimento && <> • Novo vencimento: {fmtData(ad.novaDataVencimento)}</>}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" onClick={() => toggleExpandir(idx)} style={miniBtn('#64748b')}>
                          {aberto ? '▲ Fechar' : '▼ Editar'}
                        </button>
                        <button type="button" onClick={() => removerAditamento(idx)} style={miniBtn('#b91c1c')}>
                          Remover
                        </button>
                      </div>
                    </div>

                    {aberto && (
                      <div style={{ padding: '0 16px 16px', borderTop: '1px solid #e0e7ff', background: '#fff' }}>
                        <div style={{ display: 'grid', gap: 10, paddingTop: 12 }}>
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
                      <div style={{ background: '#fff', borderTop: '1px solid #e0e7ff' }}>
                        <div style={{
                          padding: '8px 14px', fontSize: 11, fontWeight: 700,
                          color: '#334155', background: '#f8fafc', letterSpacing: 0.3,
                          borderBottom: '1px solid #f1f5f9',
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
          padding: '16px 22px', borderTop: '1px solid #e5e7eb', marginTop: 22,
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          position: 'sticky', bottom: 0, background: '#fff',
        }}>
          <button type="button" onClick={onCancelar} disabled={salvando} style={{
            padding: '10px 18px', background: '#fff', color: '#64748b',
            border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: salvando ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}>Cancelar</button>
          <button type="button" onClick={confirmar} disabled={salvando} style={{
            padding: '10px 20px',
            background: salvando ? '#94a3b8' : '#047857',
            color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
            cursor: salvando ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
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
        <tr style={{ background: '#fafafa', color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.3 }}>
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
          <tr key={idx} style={{ borderTop: '1px solid #f1f5f9' }}>
            <td style={tdStyle}>{String(idx + 1).padStart(2, '0')}</td>
            <td style={{ ...tdStyle, fontWeight: 600, color: '#1e293b' }}>{it.descricao}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{it.quantidade != null ? fmtNum(it.quantidade) : '—'}</td>
            <td style={tdStyle}>{it.unidade || '—'}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{it.valorUnitario != null ? fmtReal4(it.valorUnitario) : '—'}</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{it.valorTotal != null ? fmtReal(it.valorTotal) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

const Campo = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: 'block' }}>
    <div style={{ fontSize: 11, color: '#374151', fontWeight: 600, marginBottom: 4 }}>{label}</div>
    {children}
  </label>
)

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', border: '1px solid #e5e7eb',
  borderRadius: 6, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box', background: '#fff',
}

const grid2: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10,
}

const miniBtn = (cor: string): React.CSSProperties => ({
  padding: '5px 10px', background: 'transparent', color: cor,
  border: `1px solid ${cor}40`, borderRadius: 5, fontSize: 11, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
})

const thStyle: React.CSSProperties = {
  padding: '7px 10px', textAlign: 'left', fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
  padding: '7px 10px', color: '#334155',
}
