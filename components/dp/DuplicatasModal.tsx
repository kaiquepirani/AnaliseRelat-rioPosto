'use client'
// components/dp/DuplicatasModal.tsx
// =============================================================================
// Modal "detective" — revisa pares de colaboradores potencialmente duplicados
// e permite unificar com um clique.
// =============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react'
import { encontrarPotenciaisDuplicatas, type ParDuplicata } from '@/lib/dedup-nomes'

interface Colaborador {
  id: string
  nome: string
  cidade: string
  status?: string
}

interface Fechamento {
  id: string
  mesAno: string
  tipo: 'antecipacao' | 'folha'
  totalPorCidade: Record<string, number>
  valorPorColaborador: Record<string, number>
}

interface ParEnriquecido extends ParDuplicata {
  totalA: number
  totalB: number
  pagamentosA: number
  pagamentosB: number
}

interface Props {
  onClose: () => void
  onUnificacaoFeita?: () => Promise<void> | void
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const norm = (s: string) => s.trim().toUpperCase()

export default function DuplicatasModal({ onClose, onUnificacaoFeita }: Props) {
  const [colabs, setColabs] = useState<Colaborador[]>([])
  const [fechs, setFechs]   = useState<Fechamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [unificando, setUnificando] = useState<string | null>(null)
  const [paresIgnorados, setParesIgnorados] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const [c, f] = await Promise.all([
        fetch('/api/dp/colaboradores').then(r => r.json()),
        fetch('/api/dp/fechamentos').then(r => r.json()),
      ])
      setColabs(Array.isArray(c) ? c : [])
      setFechs(Array.isArray(f) ? f : [])
    } catch (e: any) {
      setErro('Erro ao carregar dados: ' + e.message)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // ── Calcula pares de duplicatas potenciais ────────────────────────────
  const pares = useMemo<ParEnriquecido[]>(() => {
    if (colabs.length === 0) return []

    // Junta nomes do cadastro com nomes que aparecem em fechamentos
    const nomesUnicos = new Map<string, string>() // chaveNorm -> nome (cidade)
    const cidadeDe   = new Map<string, string>()

    for (const c of colabs) {
      const k = norm(c.nome)
      if (!nomesUnicos.has(k)) {
        nomesUnicos.set(k, c.nome)
        if (c.cidade) cidadeDe.set(k, c.cidade)
      }
    }

    const lista = Array.from(nomesUnicos.entries()).map(([_, nome]) => ({
      nome,
      cidade: cidadeDe.get(norm(nome)),
    }))

    const brutos = encontrarPotenciaisDuplicatas(lista, 0.75)

    // Calcula total recebido e nº de pagamentos para cada nome
    const totaisPor = new Map<string, { total: number; count: number }>()
    for (const f of fechs) {
      for (const [nome, valor] of Object.entries(f.valorPorColaborador || {})) {
        const k = norm(nome)
        const cur = totaisPor.get(k) || { total: 0, count: 0 }
        cur.total += valor
        cur.count += 1
        totaisPor.set(k, cur)
      }
    }

    const enriquecidos: ParEnriquecido[] = brutos.map(p => {
      const tA = totaisPor.get(norm(p.nomeA)) || { total: 0, count: 0 }
      const tB = totaisPor.get(norm(p.nomeB)) || { total: 0, count: 0 }
      return {
        ...p,
        totalA: tA.total,
        totalB: tB.total,
        pagamentosA: tA.count,
        pagamentosB: tB.count,
      }
    })

    return enriquecidos
  }, [colabs, fechs])

  const paresVisiveis = useMemo(
    () => pares.filter(p => !paresIgnorados.has(`${norm(p.nomeA)}|${norm(p.nomeB)}`)),
    [pares, paresIgnorados],
  )

  const unificar = async (nomeManter: string, nomeRemover: string) => {
    const chavePar = `${norm(nomeManter)}|${norm(nomeRemover)}`
    const chavePar2 = `${norm(nomeRemover)}|${norm(nomeManter)}`
    setUnificando(chavePar)
    setErro('')
    try {
      const res = await fetch('/api/dp/admin/unificar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomeManter, nomeRemover }),
      })
      const data = await res.json()
      if (!res.ok || data.erro) throw new Error(data.erro || 'Erro ao unificar')
      setParesIgnorados(prev => new Set(prev).add(chavePar).add(chavePar2))
      await carregar()
      if (onUnificacaoFeita) await onUnificacaoFeita()
    } catch (e: any) {
      setErro(e.message || 'Erro ao unificar')
    } finally {
      setUnificando(null)
    }
  }

  const ignorarPar = (nomeA: string, nomeB: string) => {
    const k1 = `${norm(nomeA)}|${norm(nomeB)}`
    const k2 = `${norm(nomeB)}|${norm(nomeA)}`
    setParesIgnorados(prev => new Set(prev).add(k1).add(k2))
  }

  return (
    <div
      onClick={() => !unificando && onClose()}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,20,40,0.55)', backdropFilter: 'blur(4px)',
        zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
        fontFamily: 'inherit',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 16, width: '100%', maxWidth: 820,
          maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ background: '#2D3A6B', color: 'white', padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 0.5, fontWeight: 600 }}>
              REVISAR DUPLICATAS
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>
              🔍 Possíveis colaboradores duplicados
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
              Encontrados {paresVisiveis.length} par{paresVisiveis.length !== 1 ? 'es' : ''} para revisão
            </div>
          </div>
          <button
            onClick={() => !unificando && onClose()}
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white',
              width: 32, height: 32, borderRadius: 8,
              cursor: unificando ? 'default' : 'pointer',
              fontSize: 16, lineHeight: 1, fontFamily: 'inherit',
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 22px', flex: 1, overflowY: 'auto' }}>
          {carregando ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Carregando…</div>
          ) : paresVisiveis.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>✨</div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#374151' }}>Tudo limpo!</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Nenhum par de colaboradores parecidos foi detectado.
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14, lineHeight: 1.5 }}>
                Cada par abaixo tem nomes parecidos que podem ser a <strong>mesma pessoa</strong> com erro de digitação.
                Escolha qual nome <strong>manter</strong> — todos os pagamentos do outro serão transferidos para ele,
                e o duplicado será removido do cadastro.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {paresVisiveis.map((p, i) => {
                  const k = `${norm(p.nomeA)}|${norm(p.nomeB)}`
                  const k2 = `${norm(p.nomeB)}|${norm(p.nomeA)}`
                  const estaUnificando = unificando === k || unificando === k2
                  const corScore = p.score >= 0.95 ? '#dc2626' : p.score >= 0.85 ? '#d97706' : '#2563eb'

                  return (
                    <div
                      key={i}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: 10,
                        padding: 14,
                        background: estaUnificando ? '#f9fafb' : 'white',
                        opacity: estaUnificando ? 0.6 : 1,
                      }}
                    >
                      {/* Score header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, fontSize: 11, color: '#6b7280' }}>
                        <span style={{
                          background: corScore + '15', color: corScore,
                          padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                        }}>
                          {(p.score * 100).toFixed(0)}% similar
                        </span>
                        <span>
                          {p.detalhe.bonusCidade > 0 && '· mesma cidade '}
                          {p.detalhe.bonusApelido > 0 && '· mesmo apelido '}
                          {p.detalhe.bonusIniciais > 0 && '· mesmas iniciais '}
                        </span>
                      </div>

                      {/* Pares */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                        <CardNome
                          nome={p.nomeA}
                          cidade={p.cidadeA}
                          total={p.totalA}
                          pagamentos={p.pagamentosA}
                        />
                        <CardNome
                          nome={p.nomeB}
                          cidade={p.cidadeB}
                          total={p.totalB}
                          pagamentos={p.pagamentosB}
                        />
                      </div>

                      {/* Ações */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => ignorarPar(p.nomeA, p.nomeB)}
                          disabled={estaUnificando}
                          style={{
                            padding: '6px 12px', fontSize: 12, fontWeight: 600,
                            border: '1px solid #e5e7eb', background: 'white', color: '#6b7280',
                            borderRadius: 6, cursor: estaUnificando ? 'default' : 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          São pessoas diferentes
                        </button>
                        <button
                          onClick={() => unificar(p.nomeB, p.nomeA)}
                          disabled={estaUnificando}
                          style={{
                            padding: '6px 12px', fontSize: 12, fontWeight: 600,
                            border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8',
                            borderRadius: 6, cursor: estaUnificando ? 'default' : 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          Unificar como B →
                        </button>
                        <button
                          onClick={() => unificar(p.nomeA, p.nomeB)}
                          disabled={estaUnificando}
                          style={{
                            padding: '6px 12px', fontSize: 12, fontWeight: 700,
                            border: 'none', background: '#2D3A6B', color: 'white',
                            borderRadius: 6, cursor: estaUnificando ? 'default' : 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          {estaUnificando ? 'Unificando…' : '← Unificar como A'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {erro && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 13 }}>
              ⚠️ {erro}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e5e7eb', background: '#f9fafb', padding: '12px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#6b7280' }}>
            💡 Pares com 90% ou mais de similaridade já são unificados automaticamente na importação.
          </div>
          <button
            onClick={() => !unificando && onClose()}
            disabled={!!unificando}
            style={{
              padding: '8px 16px', border: '1px solid #e5e7eb', background: 'white',
              color: '#374151', borderRadius: 8, cursor: unificando ? 'default' : 'pointer',
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

// ─────────────────────────────────────────────────────────────────────
// Subcomponente: card de um nome no par
// ─────────────────────────────────────────────────────────────────────
function CardNome({ nome, cidade, total, pagamentos }: { nome: string; cidade?: string; total: number; pagamentos: number }) {
  return (
    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#2D3A6B', wordBreak: 'break-word' }}>{nome}</div>
      {cidade && (
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
          📍 {cidade}
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11 }}>
        <span style={{ color: '#374151' }}>
          <strong style={{ color: '#16a34a' }}>{fmt(total)}</strong>
        </span>
        <span style={{ color: '#6b7280' }}>
          {pagamentos} pagamento{pagamentos !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  )
}
