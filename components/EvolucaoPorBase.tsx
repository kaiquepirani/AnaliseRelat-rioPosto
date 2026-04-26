'use client'
import { useState, useMemo } from 'react'
import { Extrato } from '@/lib/types'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { BASES_PADRAO, matchTolerante } from '@/lib/gestao-types'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtL = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L'
const fmtK = (v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : fmt(v)

const NAO_MAPEADOS = 'Não mapeados'

// Paleta alinhada com a /gestao operacional pra dar consistência visual
const PALETA_BASES = [
  '#2D3A6B', '#4AABDB', '#10b981', '#f59e0b', '#7c3aed', '#dc2626',
  '#0891b2', '#ea580c', '#84cc16', '#ec4899', '#6366f1', '#14b8a6',
]
const COR_NAO_MAPEADOS = '#94a3b8'   // cinza neutro pra ficar visualmente óbvio que precisa categorizar

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

  // Mapa posto → base (usa as bases do /gestao via matchTolerante; resto vai pra "Não mapeados")
  const mapaPostoBase = useMemo(() => {
    const out: Record<string, string> = {}
    extratos.forEach(e => e.postos.forEach(posto => {
      if (out[posto.nome] != null) return
      let baseEncontrada: string | null = null
      for (let i = 0; i < BASES_PADRAO.length; i++) {
        if (matchTolerante(posto.nome, BASES_PADRAO[i].postos)) {
          baseEncontrada = BASES_PADRAO[i].nome
          break
        }
      }
      out[posto.nome] = baseEncontrada || NAO_MAPEADOS
    }))
    return out
  }, [extratos])

  // Lista de bases que efetivamente aparecem nos dados (na ordem do BASES_PADRAO; "Não mapeados" no fim)
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

  // Mapa mensal: mes → base → totais
  const mapaBase = useMemo(() => {
    const mapa: Record<string, Record<string, { valor: number; litros: number }>> = {}
    extratos.forEach(e => e.postos.forEach(posto => {
      const base = mapaPostoBase[posto.nome] || NAO_MAPEADOS
      posto.lancamentos.forEach(l => {
        const d = parsarDataBR(l.emissao)
        if (!d) return
        const key = mesAnoKey(d)
        if (!mapa[key]) mapa[key] = {}
        if (!mapa[key][base]) mapa[key][base] = { valor: 0, litros: 0 }
        mapa[key][base].valor += l.valor
        mapa[key][base].litros += l.litros
      })
    }))
    return mapa
  }, [extratos, mapaPostoBase])

  // Dados pro gráfico
  const dadosEvolucao = useMemo(() => {
    return Object.entries(mapaBase)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, bd]) => {
        const entry: Record<string, any> = { label: labelMes(key), key }
        if (baseSel) {
          entry[baseSel] = metrica === 'valor'
            ? parseFloat((bd[baseSel]?.valor || 0).toFixed(2))
            : parseFloat((bd[baseSel]?.litros || 0).toFixed(1))
        } else {
          basesAtivas.forEach(nome => {
            entry[nome] = metrica === 'valor'
              ? parseFloat((bd[nome]?.valor || 0).toFixed(2))
              : parseFloat((bd[nome]?.litros || 0).toFixed(1))
          })
        }
        return entry
      })
  }, [mapaBase, basesAtivas, baseSel, metrica])

  const basesNoGrafico = baseSel ? [baseSel] : basesAtivas

  // Tooltip customizado (mesmo padrão visual do gráfico irmão de postos)
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const total = payload.reduce((s: number, p: any) => s + (p.value || 0), 0)
    return (
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 14px', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxWidth: 280 }}>
        <div style={{ fontWeight: 700, color: '#2D3A6B', marginBottom: 8, fontSize: 13 }}>{label}</div>
        {payload.map((p: any, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: p.fill, flexShrink: 0 }} />
            <span style={{ color: '#6b7280', flex: 1 }}>{p.name}</span>
            <span style={{ fontWeight: 600 }}>{metrica === 'valor' ? fmt(p.value) : fmtL(p.value)}</span>
          </div>
        ))}
        {payload.length > 1 && (
          <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
            <span>Total</span>
            <span style={{ color: '#2D3A6B' }}>{metrica === 'valor' ? fmt(total) : fmtL(total)}</span>
          </div>
        )}
      </div>
    )
  }

  const dadosMensais = Object.entries(mapaBase).sort(([a], [b]) => a.localeCompare(b))

  if (basesAtivas.length === 0) return null

  // Lista de postos da base selecionada (pra mostrar no resumo)
  const postosDaBaseSel = baseSel
    ? Object.keys(mapaPostoBase).filter(p => mapaPostoBase[p] === baseSel).sort()
    : []

  return (
    <div className="grafico-card">
      <div style={{ marginBottom: '1rem' }}>
        <div className="grafico-titulo" style={{ margin: 0 }}>Evolução mensal por base operacional</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
          Postos agrupados pelas bases definidas em <strong>/gestao</strong> · &ldquo;Todos&rdquo; exibe todas empilhadas
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

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={dadosEvolucao} margin={{ top: 5, right: 20, left: 10, bottom: 5 }} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fontWeight: 600 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => metrica === 'valor' ? fmtK(v) : `${(v / 1000).toFixed(1)}kL`} width={60} />
          <Tooltip content={<CustomTooltip />} />
          {!baseSel && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {basesNoGrafico.map((nome, i) => (
            <Bar key={nome} dataKey={nome} name={nome}
              stackId={baseSel ? undefined : 'a'}
              fill={corBase(nome)}
              radius={baseSel ? [4, 4, 0, 0] : i === basesNoGrafico.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      {/* Box de resumo quando uma base é selecionada */}
      {baseSel && (() => {
        const totalValor = dadosMensais.reduce((s, [, bd]) => s + (bd[baseSel]?.valor || 0), 0)
        const totalLitros = dadosMensais.reduce((s, [, bd]) => s + (bd[baseSel]?.litros || 0), 0)
        const mediaMensal = dadosMensais.length > 0 ? totalValor / dadosMensais.length : 0
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

            {postosDaBaseSel.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${isNaoMapeado ? '#fde68a' : 'rgba(0,0,0,0.05)'}`, fontSize: 11, color: 'var(--text-2)' }}>
                <strong>Postos:</strong> {postosDaBaseSel.join(' · ')}
              </div>
            )}

            {isNaoMapeado && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#92400e', fontWeight: 600 }}>
                ⚠️ Esses postos não estão mapeados em nenhuma base. Adicione-os em <code>lib/gestao-types.ts</code> dentro do array <code>postos</code> da base correta.
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
