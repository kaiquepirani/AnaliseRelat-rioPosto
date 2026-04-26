'use client'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { Extrato } from '@/lib/types'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, LabelList,
} from 'recharts'
import {
  BASES_PADRAO,
  encontrarBaseDoPosto,
  chaveVinculoPosto,
  type VinculosPostos,
} from '@/lib/gestao-types'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtL = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L'
const fmtK = (v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : fmt(v)
const fmtKL = (v: number) => `${(v / 1000).toFixed(1)}kL`

const NAO_MAPEADOS = 'Não mapeados'

const PALETA_BASES = [
  '#2D3A6B', '#4AABDB', '#10b981', '#f59e0b', '#7c3aed', '#dc2626',
  '#0891b2', '#ea580c', '#84cc16', '#ec4899', '#6366f1', '#14b8a6',
]

// Paleta separada pros postos (quando uma base é expandida em postos)
const PALETA_POSTOS = [
  '#1e40af', '#0891b2', '#059669', '#65a30d', '#ca8a04',
  '#dc2626', '#9333ea', '#c026d3', '#0284c7', '#16a34a',
  '#4f46e5', '#0d9488', '#be185d', '#7c2d12', '#1e3a8a',
]
const COR_NAO_MAPEADOS = '#94a3b8'

function parsarDataBR(data: string): Date | null {
  const m = data.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return null
  let ano = parseInt(m[3])
  if (ano < 100) ano += ano < 50 ? 2000 : 1900
  return new Date(ano, parseInt(m[2]) - 1, parseInt(m[1]))
}

function mesAnoKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function labelMes(key: string) {
  const [ano, mes] = key.split('-')
  const n = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${n[parseInt(mes) - 1]}/${ano.slice(2)}`
}

interface Props {
  extratos: Extrato[]
  metrica: 'valor' | 'litros'
}

export default function EvolucaoPorBase({ extratos, metrica }: Props) {
  const [baseSel, setBaseSel] = useState<string | null>(null)
  const [vinculos, setVinculos] = useState<VinculosPostos>({})
  const [modalPosto, setModalPosto] = useState<string | null>(null)
  const [salvandoVinculo, setSalvandoVinculo] = useState(false)

  // ─────────────────────────────────────────────────────────────────────
  // Carregar vínculos manuais do Redis
  // ─────────────────────────────────────────────────────────────────────
  const carregarVinculos = useCallback(async () => {
    try {
      const res = await fetch('/api/vinculos-postos')
      if (res.ok) {
        const data = await res.json()
        setVinculos(data || {})
      }
    } catch {
      // silencioso — sem vínculos é só fallback pro matching tolerante
    }
  }, [])

  useEffect(() => { carregarVinculos() }, [carregarVinculos])

  // ─────────────────────────────────────────────────────────────────────
  // Mapeamento posto → base (override + matching tolerante)
  // ─────────────────────────────────────────────────────────────────────
  const mapaPostoBase = useMemo(() => {
    const out: Record<string, string> = {}
    extratos.forEach(e => e.postos.forEach(posto => {
      if (out[posto.nome] != null) return
      const base = encontrarBaseDoPosto(posto.nome, BASES_PADRAO, vinculos)
      out[posto.nome] = base ? base.nome : NAO_MAPEADOS
    }))
    return out
  }, [extratos, vinculos])

  const isVinculoManual = useCallback((nomePosto: string): boolean => {
    const chave = chaveVinculoPosto(nomePosto)
    return chave in vinculos
  }, [vinculos])

  // Bases que aparecem nos dados (em ordem do BASES_PADRAO; "Não mapeados" no fim)
  const basesAtivas = useMemo(() => {
    const presentes: Record<string, true> = {}
    Object.keys(mapaPostoBase).forEach(p => { presentes[mapaPostoBase[p]] = true })
    const ordenado: string[] = []
    BASES_PADRAO.forEach(b => { if (presentes[b.nome]) ordenado.push(b.nome) })
    if (presentes[NAO_MAPEADOS]) ordenado.push(NAO_MAPEADOS)
    return ordenado
  }, [mapaPostoBase])

  const corBase = (nome: string) => {
    if (nome === NAO_MAPEADOS) return COR_NAO_MAPEADOS
    const idx = BASES_PADRAO.findIndex(b => b.nome === nome)
    return idx >= 0 ? PALETA_BASES[idx % PALETA_BASES.length] : COR_NAO_MAPEADOS
  }

  // Lista global de postos (todos os extratos), pra dar cor estável a cada um
  const todosPostos = useMemo(() => {
    const s: Record<string, true> = {}
    extratos.forEach(e => e.postos.forEach(p => { s[p.nome] = true }))
    return Object.keys(s).sort()
  }, [extratos])

  const corDoPosto = useCallback((nomePosto: string): string => {
    const idx = todosPostos.indexOf(nomePosto)
    return PALETA_POSTOS[idx >= 0 ? idx % PALETA_POSTOS.length : 0]
  }, [todosPostos])

  // ─────────────────────────────────────────────────────────────────────
  // Mapas de agregação (mês → base → totais; mês → posto → totais)
  // ─────────────────────────────────────────────────────────────────────
  const { mapaPorBase, mapaPorPosto } = useMemo(() => {
    const mb: Record<string, Record<string, { valor: number; litros: number }>> = {}
    const mp: Record<string, Record<string, { valor: number; litros: number }>> = {}
    extratos.forEach(e => e.postos.forEach(posto => {
      const base = mapaPostoBase[posto.nome] || NAO_MAPEADOS
      posto.lancamentos.forEach(l => {
        const d = parsarDataBR(l.emissao)
        if (!d) return
        const key = mesAnoKey(d)
        if (!mb[key]) mb[key] = {}
        if (!mb[key][base]) mb[key][base] = { valor: 0, litros: 0 }
        mb[key][base].valor += l.valor
        mb[key][base].litros += l.litros

        if (!mp[key]) mp[key] = {}
        if (!mp[key][posto.nome]) mp[key][posto.nome] = { valor: 0, litros: 0 }
        mp[key][posto.nome].valor += l.valor
        mp[key][posto.nome].litros += l.litros
      })
    }))
    return { mapaPorBase: mb, mapaPorPosto: mp }
  }, [extratos, mapaPostoBase])

  // Postos da base selecionada (em ordem alfabética)
  const postosDaBaseSel = useMemo(() => (
    baseSel
      ? Object.keys(mapaPostoBase).filter(p => mapaPostoBase[p] === baseSel).sort()
      : []
  ), [baseSel, mapaPostoBase])

  // ─────────────────────────────────────────────────────────────────────
  // Dados pro gráfico
  // ─────────────────────────────────────────────────────────────────────
  // Quando "Todos": empilhado por base, com __total__ no topo
  // Quando base selecionada: empilhado por POSTO da base, com __total__ no topo
  const dadosEvolucao = useMemo(() => {
    const mesesOrdenados = Object.keys(mapaPorBase).sort()
    return mesesOrdenados.map(key => {
      const entry: Record<string, any> = { label: labelMes(key), key }
      let total = 0

      if (baseSel) {
        const dadosMesPosto = mapaPorPosto[key] || {}
        for (let i = 0; i < postosDaBaseSel.length; i++) {
          const nomePosto = postosDaBaseSel[i]
          const v = dadosMesPosto[nomePosto] || { valor: 0, litros: 0 }
          const valor = metrica === 'valor'
            ? parseFloat(v.valor.toFixed(2))
            : parseFloat(v.litros.toFixed(1))
          entry[nomePosto] = valor
          total += valor
        }
      } else {
        const dadosMesBase = mapaPorBase[key] || {}
        for (let i = 0; i < basesAtivas.length; i++) {
          const nome = basesAtivas[i]
          const v = dadosMesBase[nome] || { valor: 0, litros: 0 }
          const valor = metrica === 'valor'
            ? parseFloat(v.valor.toFixed(2))
            : parseFloat(v.litros.toFixed(1))
          entry[nome] = valor
          total += valor
        }
      }
      entry.__total__ = parseFloat(total.toFixed(metrica === 'valor' ? 2 : 1))
      return entry
    })
  }, [mapaPorBase, mapaPorPosto, basesAtivas, baseSel, metrica, postosDaBaseSel])

  const stackKeys = baseSel ? postosDaBaseSel : basesAtivas

  // ─────────────────────────────────────────────────────────────────────
  // Tooltip
  // ─────────────────────────────────────────────────────────────────────
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0)
    return (
      <div style={{
        background: 'white', border: '1px solid #e5e7eb', borderRadius: 10,
        padding: '10px 14px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        maxWidth: 320,
      }}>
        <div style={{ fontWeight: 700, color: '#2D3A6B', marginBottom: 8, fontSize: 13 }}>
          {label}
          {baseSel && <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginLeft: 6 }}>· {baseSel}</span>}
        </div>
        {payload
          .slice()
          .sort((a: any, b: any) => (b.value || 0) - (a.value || 0))
          .map((p: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: p.fill, flexShrink: 0 }} />
              <span style={{ color: '#6b7280', flex: 1 }}>
                {p.name.length > 30 ? p.name.slice(0, 30) + '…' : p.name}
              </span>
              <span style={{ fontWeight: 600 }}>{metrica === 'valor' ? fmt(p.value) : fmtL(p.value)}</span>
            </div>
          ))}
        {payload.length > 1 && (
          <div style={{
            borderTop: '1px solid #e5e7eb', marginTop: 6, paddingTop: 6,
            display: 'flex', justifyContent: 'space-between', fontWeight: 700,
          }}>
            <span>Total</span>
            <span style={{ color: '#2D3A6B' }}>{metrica === 'valor' ? fmt(total) : fmtL(total)}</span>
          </div>
        )}
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────
  // Ações de vinculação
  // ─────────────────────────────────────────────────────────────────────
  const vincularPosto = async (nomePosto: string, baseId: string) => {
    setSalvandoVinculo(true)
    try {
      const res = await fetch('/api/vinculos-postos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomePosto, baseId }),
      })
      if (!res.ok) throw new Error('Falha ao salvar vínculo')
      await carregarVinculos()
      setModalPosto(null)
      const baseAlvo = BASES_PADRAO.find(b => b.id === baseId)
      if (baseAlvo) setBaseSel(baseAlvo.nome)
    } catch (e: any) {
      alert('Erro ao vincular posto: ' + (e?.message || 'tente novamente'))
    } finally {
      setSalvandoVinculo(false)
    }
  }

  const desvincularPosto = async (nomePosto: string) => {
    if (!confirm(`Remover vínculo manual de "${nomePosto}"?\n\nO posto voltará ao mapeamento automático (matching tolerante com BASES_PADRAO).`)) return
    setSalvandoVinculo(true)
    try {
      const res = await fetch('/api/vinculos-postos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomePosto }),
      })
      if (!res.ok) throw new Error('Falha ao remover vínculo')
      await carregarVinculos()
      setModalPosto(null)
    } catch (e: any) {
      alert('Erro ao remover vínculo: ' + (e?.message || 'tente novamente'))
    } finally {
      setSalvandoVinculo(false)
    }
  }

  if (basesAtivas.length === 0) return null

  return (
    <div className="grafico-card">
      <div style={{ marginBottom: '1rem' }}>
        <div className="grafico-titulo" style={{ margin: 0 }}>Evolução mensal por base operacional</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
          {baseSel
            ? <>Mostrando os <strong>{postosDaBaseSel.length}</strong> {postosDaBaseSel.length === 1 ? 'posto' : 'postos'} da base <strong>{baseSel}</strong> empilhados</>
            : <>Postos agrupados pelas bases definidas em <strong>/gestao</strong> · &ldquo;Todos&rdquo; exibe todas empilhadas</>
          }
        </div>
      </div>

      {/* Chips de base */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '1.25rem' }}>
        <button
          onClick={() => setBaseSel(null)}
          style={{
            padding: '5px 14px', fontSize: 11, fontWeight: 700, borderRadius: 20,
            border: `1.5px solid ${baseSel === null ? 'var(--navy)' : 'var(--border)'}`,
            background: baseSel === null ? 'var(--navy)' : 'var(--bg)',
            color: baseSel === null ? 'white' : 'var(--text-2)',
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
          }}
        >Todos</button>
        {basesAtivas.map(nome => {
          const cor = corBase(nome)
          const ativo = baseSel === nome
          const isNaoMapeado = nome === NAO_MAPEADOS
          return (
            <button key={nome} onClick={() => setBaseSel(ativo ? null : nome)} style={{
              padding: '5px 14px', fontSize: 11, fontWeight: 600, borderRadius: 20,
              border: `1.5px solid ${ativo ? cor : 'var(--border)'}`,
              background: ativo ? cor : 'var(--bg)',
              color: ativo ? 'white' : (isNaoMapeado ? '#92400e' : 'var(--text-2)'),
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              fontStyle: isNaoMapeado ? 'italic' : 'normal',
            }}>
              {isNaoMapeado ? `⚠️ ${nome}` : nome}
            </button>
          )
        })}
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <BarChart
          data={dadosEvolucao}
          margin={{ top: 30, right: 20, left: 10, bottom: 5 }}
          barCategoryGap="25%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 600 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={v => metrica === 'valor' ? fmtK(v) : fmtKL(v)}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(45,58,107,0.04)' }} />
          {stackKeys.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={n => n.length > 28 ? n.slice(0, 28) + '…' : n}
            />
          )}
          {stackKeys.map((nome, i) => {
            const cor = baseSel ? corDoPosto(nome) : corBase(nome)
            const isLast = i === stackKeys.length - 1
            return (
              <Bar
                key={nome}
                dataKey={nome}
                name={nome}
                stackId="a"
                fill={cor}
                radius={isLast ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              >
                {/* Label do TOTAL no topo da última barra empilhada de cada mês */}
                {isLast && (
                  <LabelList
                    dataKey="__total__"
                    position="top"
                    formatter={(v: number) => metrica === 'valor' ? fmtK(v) : fmtL(v)}
                    style={{ fontSize: 11, fill: '#1e293b', fontWeight: 700 }}
                  />
                )}
              </Bar>
            )
          })}
        </BarChart>
      </ResponsiveContainer>

      {/* Box de resumo quando uma base é selecionada */}
      {baseSel && (() => {
        const totaisPorMes = Object.entries(mapaPorBase).sort(([a], [b]) => a.localeCompare(b))
        const totalValor = totaisPorMes.reduce((s, [, bd]) => s + (bd[baseSel]?.valor || 0), 0)
        const totalLitros = totaisPorMes.reduce((s, [, bd]) => s + (bd[baseSel]?.litros || 0), 0)
        const mediaMensal = totaisPorMes.length > 0 ? totalValor / totaisPorMes.length : 0
        const isNaoMapeado = baseSel === NAO_MAPEADOS
        return (
          <div style={{
            marginTop: '1rem', padding: '0.75rem 1rem',
            background: isNaoMapeado ? '#fffbeb' : 'var(--sky-light)',
            border: isNaoMapeado ? '1px solid #fde68a' : 'none',
            borderRadius: 8,
          }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total acumulado</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{fmt(totalValor)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total litros</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{fmtL(totalLitros)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Média mensal</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{fmt(mediaMensal)}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Postos</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{postosDaBaseSel.length}</div>
              </div>
            </div>

            {/* Lista de postos desta base com cor + ações */}
            {postosDaBaseSel.length > 0 && (
              <div style={{
                marginTop: 12, paddingTop: 10,
                borderTop: `1px solid ${isNaoMapeado ? '#fde68a' : 'rgba(0,0,0,0.05)'}`,
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
                  Postos
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {postosDaBaseSel.map(p => {
                    const manual = isVinculoManual(p)
                    return (
                      <div
                        key={p}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '4px 10px', fontSize: 11,
                          background: 'white',
                          border: `1px solid ${manual ? '#86efac' : 'var(--border)'}`,
                          borderRadius: 6,
                          color: 'var(--text-2)',
                        }}
                      >
                        {/* Bolinha colorida = mesma cor da barra empilhada */}
                        <span style={{
                          width: 10, height: 10, borderRadius: 2,
                          background: corDoPosto(p), flexShrink: 0,
                        }} />
                        {manual && <span title="Vínculo manual" style={{ fontSize: 10 }}>🔗</span>}
                        <span style={{ fontWeight: 500 }}>{p}</span>
                        <button
                          onClick={() => setModalPosto(p)}
                          style={{
                            border: 'none', background: 'transparent', cursor: 'pointer',
                            padding: '0 2px', color: '#4AABDB', fontSize: 11, fontWeight: 600,
                            fontFamily: 'inherit',
                          }}
                          title={manual ? 'Alterar/remover vínculo manual' : 'Vincular a outra base'}
                        >
                          {manual ? 'editar' : 'vincular'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {isNaoMapeado && (
              <div style={{ marginTop: 10, fontSize: 11, color: '#92400e', fontWeight: 600 }}>
                ⚠️ Esses postos ainda não estão atribuídos a nenhuma base. Clique em <strong>vincular</strong> ao lado de cada um — o vínculo se aplica também à <strong>/gestao</strong>.
              </div>
            )}
          </div>
        )
      })()}

      {/* Modal de vinculação */}
      {modalPosto && (
        <ModalVinculo
          nomePosto={modalPosto}
          baseAtualId={(() => {
            const baseAtual = encontrarBaseDoPosto(modalPosto, BASES_PADRAO, vinculos)
            return baseAtual ? baseAtual.id : null
          })()}
          temVinculoManual={isVinculoManual(modalPosto)}
          salvando={salvandoVinculo}
          onCancel={() => setModalPosto(null)}
          onVincular={baseId => vincularPosto(modalPosto, baseId)}
          onDesvincular={() => desvincularPosto(modalPosto)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal de vinculação manual
// ─────────────────────────────────────────────────────────────────────────────
interface ModalProps {
  nomePosto: string
  baseAtualId: string | null
  temVinculoManual: boolean
  salvando: boolean
  onCancel: () => void
  onVincular: (baseId: string) => void
  onDesvincular: () => void
}

function ModalVinculo({
  nomePosto, baseAtualId, temVinculoManual, salvando,
  onCancel, onVincular, onDesvincular,
}: ModalProps) {
  const [baseEscolhida, setBaseEscolhida] = useState<string | null>(baseAtualId)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '1rem',
      }}
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 16, padding: '1.5rem',
          maxWidth: 480, width: '100%', maxHeight: '85vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)' }}>
            🔗 Vincular posto a uma base
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
            O vínculo é salvo no servidor e se aplica automaticamente também ao painel <strong>/gestao</strong>.
          </div>
        </div>

        <div style={{
          padding: '0.75rem 1rem', background: '#f8fafc',
          border: '1px solid var(--border)', borderRadius: 8, marginBottom: '1.25rem',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
            Posto
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy)', wordBreak: 'break-word' }}>
            {nomePosto}
          </div>
          {temVinculoManual && (
            <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, marginTop: 6 }}>
              🔗 Atualmente com vínculo manual
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
          Vincular a:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: '1.25rem' }}>
          {BASES_PADRAO.map(b => (
            <label
              key={b.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 6,
                border: `1.5px solid ${baseEscolhida === b.id ? 'var(--navy)' : 'var(--border)'}`,
                background: baseEscolhida === b.id ? 'var(--sky-light)' : 'white',
                cursor: 'pointer', transition: 'all 0.1s',
              }}
            >
              <input
                type="radio"
                name="base"
                checked={baseEscolhida === b.id}
                onChange={() => setBaseEscolhida(b.id)}
                style={{ cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', flex: 1 }}>
                {b.nome}
              </span>
              {b.postos.length > 0 && (
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                  {b.postos.length} {b.postos.length === 1 ? 'posto' : 'postos'}
                </span>
              )}
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            {temVinculoManual && (
              <button
                onClick={onDesvincular}
                disabled={salvando}
                style={{
                  padding: '0.55rem 1rem', fontSize: 12, fontWeight: 600,
                  background: 'white', color: '#dc2626',
                  border: '1px solid #fecaca', borderRadius: 8,
                  cursor: salvando ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  opacity: salvando ? 0.6 : 1,
                }}
              >
                Remover vínculo manual
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onCancel}
              disabled={salvando}
              style={{
                padding: '0.55rem 1.1rem', fontSize: 13, fontWeight: 600,
                background: 'white', color: 'var(--text-2)',
                border: '1px solid var(--border)', borderRadius: 8,
                cursor: salvando ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                opacity: salvando ? 0.6 : 1,
              }}
            >
              Cancelar
            </button>
            <button
              onClick={() => baseEscolhida && onVincular(baseEscolhida)}
              disabled={!baseEscolhida || salvando || baseEscolhida === baseAtualId}
              style={{
                padding: '0.55rem 1.25rem', fontSize: 13, fontWeight: 700,
                background: 'var(--navy)', color: 'white',
                border: 'none', borderRadius: 8,
                cursor: (!baseEscolhida || salvando || baseEscolhida === baseAtualId) ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: (!baseEscolhida || salvando || baseEscolhida === baseAtualId) ? 0.5 : 1,
              }}
            >
              {salvando ? 'Salvando...' : 'Vincular'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
