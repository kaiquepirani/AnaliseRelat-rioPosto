'use client'
// components/gestao/TerceirizacaoModal.tsx
// =============================================================================
// Modal pra cadastrar e visualizar lançamentos manuais de terceirização.
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { LancamentoTerceirizacao } from '@/lib/gestao-types'
import { BASES_PADRAO, ANO_GESTAO } from '@/lib/gestao-types'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const NOMES_MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const NOMES_MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function labelMesAno(ma: string) {
  const [ano, mes] = ma.split('-')
  return `${NOMES_MESES_LONGOS[parseInt(mes) - 1]}/${ano}`
}

interface Props {
  token: string
  onClose: () => void
  onChange?: () => Promise<void> | void
}

export default function TerceirizacaoModal({ token, onClose, onChange }: Props) {
  const [lancamentos, setLancamentos] = useState<LancamentoTerceirizacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [removendo, setRemovendo] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  // Form fields
  const [baseId, setBaseId] = useState<string>(BASES_PADRAO[0]?.id || '')
  const [mesAno, setMesAno] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('')

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }), [token])

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const res = await fetch('/api/gestao/terceirizacao', { headers })
      const data = await res.json()
      setLancamentos(Array.isArray(data) ? data : [])
    } catch (e: any) {
      setErro('Erro ao carregar: ' + (e?.message || 'desconhecido'))
    } finally {
      setCarregando(false)
    }
  }, [headers])

  useEffect(() => { carregar() }, [carregar])

  const limparForm = () => {
    setNome('')
    setValor('')
  }

  const adicionar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (salvando) return

    const valorNum = parseFloat(valor.replace(',', '.'))
    if (!nome.trim()) { setErro('Informe o nome do terceirizado'); return }
    if (!Number.isFinite(valorNum) || valorNum <= 0) { setErro('Valor inválido'); return }
    if (!baseId) { setErro('Selecione uma base'); return }
    if (!/^\d{4}-\d{2}$/.test(mesAno)) { setErro('Mês inválido'); return }

    setSalvando(true)
    setErro('')
    try {
      const res = await fetch('/api/gestao/terceirizacao', {
        method: 'POST',
        headers,
        body: JSON.stringify({ baseId, mesAno, nome: nome.trim(), valor: valorNum }),
      })
      const data = await res.json()
      if (!res.ok || data.erro) throw new Error(data.erro || 'Falha ao salvar')

      limparForm()
      await carregar()
      if (onChange) await onChange()
    } catch (e: any) {
      setErro(e?.message || 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  const remover = async (id: string) => {
    if (!confirm('Remover este lançamento?')) return
    setRemovendo(id)
    setErro('')
    try {
      const res = await fetch('/api/gestao/terceirizacao', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (!res.ok || data.erro) throw new Error(data.erro || 'Falha ao remover')
      await carregar()
      if (onChange) await onChange()
    } catch (e: any) {
      setErro(e?.message || 'Erro ao remover')
    } finally {
      setRemovendo(null)
    }
  }

  // ── Lançamentos agrupados por base ──
  const agrupado = useMemo(() => {
    const map: Record<string, LancamentoTerceirizacao[]> = {}
    for (const l of lancamentos) {
      if (!map[l.baseId]) map[l.baseId] = []
      map[l.baseId].push(l)
    }
    // Ordena cada grupo por mesAno desc, depois por createdAt desc
    Object.values(map).forEach(arr => {
      arr.sort((a, b) => {
        if (a.mesAno !== b.mesAno) return b.mesAno.localeCompare(a.mesAno)
        return (b.createdAt || '').localeCompare(a.createdAt || '')
      })
    })
    return map
  }, [lancamentos])

  const totalGeral = lancamentos.reduce((s, l) => s + l.valor, 0)

  // ── Lista de meses para o select (24 meses pra trás + atual) ──
  const mesesDisponiveis = useMemo(() => {
    const lista: string[] = []
    const hoje = new Date()
    for (let i = 0; i < 24; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      lista.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return lista
  }, [])

  const nomeBase = (id: string) => BASES_PADRAO.find(b => b.id === id)?.nome || id

  return (
    <div
      onClick={() => !salvando && !removendo && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,20,40,0.55)', backdropFilter: 'blur(4px)',
        zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 16, width: '100%', maxWidth: 720,
          maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
          color: 'white', padding: '18px 22px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.8, letterSpacing: 0.5, fontWeight: 600 }}>
              GESTÃO OPERACIONAL
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>
              🤝 Lançamentos de Terceirização
            </div>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
              Custos de serviços terceirizados que entram no cálculo da margem
            </div>
          </div>
          <button
            onClick={() => !salvando && !removendo && onClose()}
            style={{
              background: 'rgba(255,255,255,0.18)', border: 'none', color: 'white',
              width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
              fontSize: 16, lineHeight: 1, fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', flex: 1, overflowY: 'auto' }}>

          {/* ── FORMULÁRIO ── */}
          <form onSubmit={adicionar} style={{
            background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
            padding: 14, marginBottom: 18,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0c4a6e', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              ➕ Novo lançamento
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={labelStyle}>Base</label>
                <select
                  value={baseId}
                  onChange={e => setBaseId(e.target.value)}
                  disabled={salvando}
                  style={inputStyle}
                  required
                >
                  {BASES_PADRAO.map(b => (
                    <option key={b.id} value={b.id}>{b.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Mês de referência</label>
                <select
                  value={mesAno}
                  onChange={e => setMesAno(e.target.value)}
                  disabled={salvando}
                  style={inputStyle}
                  required
                >
                  {mesesDisponiveis.map(ma => (
                    <option key={ma} value={ma}>{labelMesAno(ma)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Nome do terceirizado</label>
                <input
                  type="text"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  disabled={salvando}
                  placeholder="Ex: Transportadora XYZ Ltda"
                  style={inputStyle}
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Valor (R$)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={valor}
                  onChange={e => setValor(e.target.value.replace(/[^\d,.]/g, ''))}
                  disabled={salvando}
                  placeholder="0,00"
                  style={{ ...inputStyle, fontWeight: 600 }}
                  required
                />
              </div>
            </div>

            {erro && (
              <div style={{
                background: '#fee2e2', color: '#991b1b', padding: '6px 10px',
                borderRadius: 6, fontSize: 12, marginBottom: 10,
              }}>
                ⚠️ {erro}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={salvando}
                style={{
                  padding: '8px 18px',
                  background: salvando ? '#94a3b8' : '#0ea5e9',
                  color: 'white', border: 'none', borderRadius: 8,
                  fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
                  cursor: salvando ? 'default' : 'pointer',
                }}
              >
                {salvando ? 'Salvando…' : '＋ Adicionar lançamento'}
              </button>
            </div>
          </form>

          {/* ── LISTA DE LANÇAMENTOS ── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #e2e8f0',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              📋 Lançamentos cadastrados
            </div>
            {lancamentos.length > 0 && (
              <div style={{ fontSize: 11, color: '#64748b' }}>
                {lancamentos.length} {lancamentos.length === 1 ? 'lançamento' : 'lançamentos'} ·
                Total <strong style={{ color: '#0ea5e9' }}>{fmt(totalGeral)}</strong>
              </div>
            )}
          </div>

          {carregando ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: 13 }}>
              Carregando…
            </div>
          ) : lancamentos.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: 30, color: '#94a3b8', fontSize: 13,
              background: '#f8fafc', borderRadius: 8, border: '1px dashed #e2e8f0',
            }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>🤝</div>
              <div style={{ fontWeight: 600, color: '#475569' }}>Nenhum lançamento ainda</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>
                Use o formulário acima para adicionar o primeiro
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {Object.entries(agrupado).map(([baseIdGrupo, lancs]) => {
                const totalBase = lancs.reduce((s, l) => s + l.valor, 0)
                return (
                  <div key={baseIdGrupo} style={{
                    border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden',
                  }}>
                    <div style={{
                      background: '#f1f5f9', padding: '8px 12px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0c4a6e' }}>
                        📍 {nomeBase(baseIdGrupo)}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#0ea5e9' }}>
                        {fmt(totalBase)}
                      </div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#fafafa', color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                          <th style={{ ...thStyle, width: 100 }}>Mês</th>
                          <th style={thStyle}>Terceirizado</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Valor</th>
                          <th style={{ ...thStyle, width: 50 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {lancs.map(l => (
                          <tr key={l.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                            <td style={tdStyle}>
                              <span style={{
                                fontSize: 11, fontWeight: 600,
                                background: '#e0f2fe', color: '#0369a1',
                                padding: '2px 8px', borderRadius: 10,
                              }}>
                                {labelMesAno(l.mesAno)}
                              </span>
                            </td>
                            <td style={{ ...tdStyle, fontWeight: 500, color: '#1e293b' }}>{l.nome}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#0ea5e9' }}>
                              {fmt(l.valor)}
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                              <button
                                onClick={() => remover(l.id)}
                                disabled={removendo === l.id}
                                title="Remover lançamento"
                                style={{
                                  padding: '3px 8px', fontSize: 11,
                                  background: '#fef2f2', color: '#dc2626',
                                  border: '1px solid #fca5a5', borderRadius: 5,
                                  cursor: removendo === l.id ? 'default' : 'pointer',
                                  fontFamily: 'inherit',
                                  opacity: removendo === l.id ? 0.5 : 1,
                                }}
                              >
                                {removendo === l.id ? '…' : '🗑️'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: '1px solid #e2e8f0', background: '#f8fafc',
          padding: '12px 22px', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{ fontSize: 11, color: '#64748b' }}>
            💡 Esses valores são abatidos da margem como uma linha separada
          </div>
          <button
            onClick={() => !salvando && !removendo && onClose()}
            disabled={!!salvando || !!removendo}
            style={{
              padding: '8px 16px', border: '1px solid #e2e8f0', background: 'white',
              color: '#374151', borderRadius: 8,
              cursor: (salvando || removendo) ? 'default' : 'pointer',
              fontWeight: 600, fontSize: 13, fontFamily: 'inherit',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#475569',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px',
  border: '1px solid #e2e8f0', borderRadius: 6,
  fontSize: 13, fontFamily: 'inherit',
  background: 'white', color: '#1e293b',
  outline: 'none',
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '8px 10px', color: '#334155', whiteSpace: 'nowrap',
}
