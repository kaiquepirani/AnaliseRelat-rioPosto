'use client'
import { useMemo } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList,
} from 'recharts'
import type { Contrato, ContratoComAlerta, ItemContrato } from '@/lib/contratos-types'
import { calcularSituacao, itensVigentes, valorTotalAtual } from '@/lib/contratos-types'

interface Props {
  contratos: Contrato[]
}

// ============================================================
// PALETA DARK PREMIUM AZUL (espelha src/lib/theme.ts)
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

const fmtReal = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtRealCompacto = (n: number) => {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(2).replace('.', ',')}M`
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}K`
  return fmtReal(n)
}
const fmtNum = (n: number) => n.toLocaleString('pt-BR')
const fmtPct = (n: number) => `${n.toFixed(1).replace('.', ',')}%`

const fmtData = (iso: string | undefined) => {
  if (!iso) return '—'
  const p = iso.split('-')
  if (p.length !== 3) return iso
  return `${p[2]}/${p[1]}/${p[0]}`
}

const fmtMesAno = (iso: string) => {
  const p = iso.split('-')
  if (p.length < 2) return iso
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const m = parseInt(p[1], 10) - 1
  return `${meses[m] || '?'}/${p[0].slice(2)}`
}

// Paleta para gráficos no fundo dark
const PALETA = [C.accent, C.gold, C.green, C.violet, C.teal, C.amber, '#22d3ee', '#fb7185']

export default function ResumoContratos({ contratos }: Props) {
  const ativos: ContratoComAlerta[] = useMemo(() => {
    return contratos
      .map(calcularSituacao)
      .filter(c => c.situacao === 'vigente' || c.situacao === 'vencendo')
  }, [contratos])

  const totalContratos = ativos.length

  const { faturamentoAnual, faturamentoMensal, totalRotas, quilometragemAnual } = useMemo(() => {
    let fat = 0
    let rotas = 0
    let km = 0
    for (const c of ativos) {
      fat += valorTotalAtual(c)
      const itens = itensVigentes(c)
      rotas += itens.length
      for (const it of itens) {
        if (it.quantidade != null && (it.unidade || '').toLowerCase().indexOf('km') !== -1) {
          km += it.quantidade
        }
      }
    }
    return {
      faturamentoAnual: fat,
      faturamentoMensal: fat / 12,
      totalRotas: rotas,
      quilometragemAnual: km,
    }
  }, [ativos])

  const timeline = useMemo(() => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const meses: { mesAno: string; label: string; contratos: ContratoComAlerta[] }[] = []
    for (let i = 0; i < 18; i++) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1)
      const ano = d.getFullYear()
      const mes = String(d.getMonth() + 1).padStart(2, '0')
      meses.push({
        mesAno: `${ano}-${mes}`,
        label: fmtMesAno(`${ano}-${mes}-01`),
        contratos: [],
      })
    }
    for (const c of ativos) {
      if (!c.dataVencimento) continue
      const mesVenc = c.dataVencimento.slice(0, 7)
      const idx = meses.findIndex(m => m.mesAno === mesVenc)
      if (idx !== -1) meses[idx].contratos.push(c)
    }
    return meses
  }, [ativos])

  const porContratante = useMemo(() => {
    const mapa: Record<string, number> = {}
    for (const c of ativos) {
      const nome = c.contratante || c.cliente || 'Sem contratante'
      mapa[nome] = (mapa[nome] || 0) + valorTotalAtual(c)
    }
    const entradas = Object.entries(mapa)
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor)
    if (entradas.length > 6) {
      const top5 = entradas.slice(0, 5)
      const outrosValor = entradas.slice(5).reduce((acc, e) => acc + e.valor, 0)
      return [...top5, { nome: 'Outros', valor: outrosValor }]
    }
    return entradas
  }, [ativos])

  const porCidade = useMemo(() => {
    const mapa: Record<string, number> = {}
    for (const c of ativos) {
      const cidade = c.cidade || 'Sem cidade'
      mapa[cidade] = (mapa[cidade] || 0) + valorTotalAtual(c)
    }
    return Object.entries(mapa)
      .map(([cidade, valor]) => ({ cidade, valor }))
      .sort((a, b) => b.valor - a.valor)
  }, [ativos])

  const operacional = useMemo(() => {
    type Op = { cidade: string; rotas: number; km: number; faturamento: number; valorMedioKm: number }
    const mapa: Record<string, Op> = {}
    for (const c of ativos) {
      const cidade = c.cidade || 'Sem cidade'
      if (!mapa[cidade]) {
        mapa[cidade] = { cidade, rotas: 0, km: 0, faturamento: 0, valorMedioKm: 0 }
      }
      const itens = itensVigentes(c)
      mapa[cidade].rotas += itens.length
      mapa[cidade].faturamento += valorTotalAtual(c)
      for (const it of itens) {
        if (it.quantidade != null && (it.unidade || '').toLowerCase().indexOf('km') !== -1) {
          mapa[cidade].km += it.quantidade
        }
      }
    }
    const lista = Object.values(mapa).map(op => ({
      ...op,
      valorMedioKm: op.km > 0 ? op.faturamento / op.km : 0,
    }))
    return lista.sort((a, b) => b.faturamento - a.faturamento)
  }, [ativos])

  const reajustes = useMemo(() => {
    type R = { data: string; percentual: number; indice: string; contratante: string; numero: string }
    const lista: R[] = []
    for (const c of ativos) {
      if (!Array.isArray(c.aditamentos)) continue
      for (const ad of c.aditamentos) {
        if (ad.percentualReajuste != null && ad.percentualReajuste > 0) {
          lista.push({
            data: ad.data,
            percentual: ad.percentualReajuste,
            indice: ad.indiceReajuste || '—',
            contratante: c.contratante || c.cliente || '',
            numero: c.numero || '',
          })
        }
      }
    }
    return lista.sort((a, b) => b.data.localeCompare(a.data))
  }, [ativos])

  // Wrapper com fundo dark estendido até as bordas da tela
  const fundoFixo: React.CSSProperties = {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: C.bg,
    backgroundImage: `
      radial-gradient(ellipse 800px 600px at 20% -10%, rgba(74,158,255,0.06), transparent 60%),
      radial-gradient(ellipse 600px 400px at 90% 110%, rgba(212,184,106,0.04), transparent 60%)
    `,
    pointerEvents: 'none',
    zIndex: 0,
  }
  const wrapperStyle: React.CSSProperties = {
    position: 'relative',
    zIndex: 1,
    color: C.ink,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    minHeight: 'calc(100vh - 200px)',
  }

  if (totalContratos === 0) {
    return (
      <>
        <div style={fundoFixo} />
        <div style={wrapperStyle}>
          <div style={{
            padding: 60, textAlign: 'center', color: C.ink2,
            background: C.bgPanel, borderRadius: 12, fontSize: 14,
            border: `1px solid ${C.border}`,
          }}>
            Nenhum contrato ativo para exibir no resumo.<br />
            <span style={{ fontSize: 12, color: C.muted, marginTop: 8, display: 'inline-block' }}>
              Cadastre contratos vigentes para visualizar o dashboard.
            </span>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div style={fundoFixo} />
      <div style={wrapperStyle}>
        <div style={{ display: 'grid', gap: 16, width: '100%', minWidth: 0 }}>

          {/* ==== KPIs Principais ==== */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
          }}>
            <KPIGrande titulo="Faturamento Anual" valor={fmtReal(faturamentoAnual)}
              sub={`${totalContratos} ${totalContratos === 1 ? 'contrato ativo' : 'contratos ativos'}`}
              cor={C.green} icone="💰" highlight />
            <KPIGrande titulo="Faturamento Mensal" valor={fmtReal(faturamentoMensal)}
              sub="média mensal" cor={C.accent} icone="📅" />
            <KPIGrande titulo="Total de Rotas" valor={fmtNum(totalRotas)}
              sub="rotas vigentes" cor={C.accent2} icone="🚌" />
            <KPIGrande titulo="Quilometragem Anual" valor={`${fmtNum(quilometragemAnual)} km`}
              sub="contratada/ano" cor={C.violet} icone="📍" />
          </div>

          {/* ==== Timeline de Vencimentos ==== */}
          <Secao titulo="📅 Timeline de Vencimentos" sub="Próximos 18 meses">
            <div style={{
              display: 'flex', gap: 6,
              overflowX: 'auto', overflowY: 'hidden',
              paddingBottom: 8,
              width: '100%',
            }}>
              {timeline.map(m => {
                const total = m.contratos.length
                const valor = m.contratos.reduce((acc, c) => acc + valorTotalAtual(c), 0)
                let bgCor: string, bdCor: string, txCor: string
                if (total === 0) {
                  bgCor = C.bgPanel2; bdCor = C.border; txCor = C.muted
                } else if (total >= 3) {
                  bgCor = `${C.red}15`; bdCor = `${C.red}40`; txCor = C.red
                } else if (total >= 2) {
                  bgCor = `${C.amber}15`; bdCor = `${C.amber}40`; txCor = C.amber
                } else {
                  bgCor = `${C.green}15`; bdCor = `${C.green}40`; txCor = C.green
                }
                return (
                  <div key={m.mesAno} style={{
                    flex: '0 0 auto',
                    width: 78,
                    background: bgCor, border: `1px solid ${bdCor}`,
                    borderRadius: 8, padding: 8, textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.ink2 }}>{m.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: txCor, marginTop: 2 }}>
                      {total === 0 ? '—' : total}
                    </div>
                    <div style={{ fontSize: 9, color: txCor, fontWeight: 600 }}>
                      {total === 0 ? 'sem' : total === 1 ? 'contrato' : 'contratos'}
                    </div>
                    {valor > 0 && (
                      <div style={{ fontSize: 9, color: C.ink2, marginTop: 2, fontWeight: 600 }}>
                        {fmtRealCompacto(valor)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {timeline.some(m => m.contratos.length > 0) && (
              <div style={{ marginTop: 12, fontSize: 12, color: C.ink2 }}>
                <strong style={{ color: C.ink }}>Vencimentos detalhados:</strong>
                <ul style={{ marginTop: 6, paddingLeft: 18, lineHeight: 1.7 }}>
                  {timeline
                    .filter(m => m.contratos.length > 0)
                    .slice(0, 6)
                    .map(m => (
                      <li key={m.mesAno}>
                        <strong style={{ color: C.ink }}>{m.label}</strong>:{' '}
                        {m.contratos.map(c => `${c.contratante || c.cliente} (${fmtData(c.dataVencimento)})`).join(' · ')}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </Secao>

          {/* ==== Gráficos lado a lado ==== */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: 14,
          }}>
            <Secao titulo="🥧 Distribuição por Contratante" sub="% do faturamento total">
              {porContratante.length > 0 ? (
                <div style={{ width: '100%', height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={porContratante} dataKey="valor" nameKey="nome"
                        cx="50%" cy="50%" outerRadius={80} innerRadius={40}
                        stroke={C.bgPanel} strokeWidth={2}
                        label={(entry: any) => fmtPct((entry.valor / faturamentoAnual) * 100)}
                        labelLine={false}>
                        {porContratante.map((_, idx) => (
                          <Cell key={idx} fill={PALETA[idx % PALETA.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: any, name: any) => [fmtReal(Number(value)), name]}
                        contentStyle={{
                          borderRadius: 8, fontSize: 12,
                          background: C.bgPanel3, border: `1px solid ${C.borderStrong}`,
                          color: C.ink,
                        }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : <Vazio texto="Sem dados" />}
              {porContratante.length > 0 && (
                <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
                  {porContratante.slice(0, 6).map((p, idx) => (
                    <div key={p.nome} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 12, color: C.ink2,
                    }}>
                      <span style={{
                        width: 10, height: 10, borderRadius: 2,
                        background: PALETA[idx % PALETA.length], flexShrink: 0,
                      }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.nome}
                      </span>
                      <strong style={{ color: C.ink }}>{fmtRealCompacto(p.valor)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </Secao>

            <Secao titulo="🏙️ Faturamento por Cidade" sub="Valor anual contratado">
              {porCidade.length > 0 ? (
                <div style={{ width: '100%', height: Math.max(220, porCidade.length * 38) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={porCidade} layout="vertical" margin={{ top: 8, right: 60, left: 10, bottom: 8 }}>
                      <defs>
                        <linearGradient id="cidadeBar" x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={C.accent3} stopOpacity={0.8} />
                          <stop offset="100%" stopColor={C.accent} stopOpacity={1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={C.border} />
                      <XAxis type="number" tickFormatter={fmtRealCompacto}
                        tick={{ fontSize: 10, fill: C.ink2 }} stroke={C.borderStrong} />
                      <YAxis type="category" dataKey="cidade"
                        tick={{ fontSize: 11, fill: C.ink2 }} stroke={C.borderStrong}
                        width={90} />
                      <Tooltip formatter={(v: any) => fmtReal(Number(v))}
                        contentStyle={{
                          borderRadius: 8, fontSize: 12,
                          background: C.bgPanel3, border: `1px solid ${C.borderStrong}`,
                          color: C.ink,
                        }}
                        cursor={{ fill: `${C.accent}15` }} />
                      <Bar dataKey="valor" fill="url(#cidadeBar)" radius={[0, 4, 4, 0]}>
                        <LabelList dataKey="valor" position="right" formatter={fmtRealCompacto}
                          style={{ fontSize: 10, fill: C.ink, fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <Vazio texto="Sem dados" />}
            </Secao>
          </div>

          {/* ==== Operacional ==== */}
          <Secao titulo="🚌 Operacional por Cidade" sub="Rotas, quilometragem e valor médio do km">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 500 }}>
                <thead>
                  <tr style={{
                    background: C.bgPanel2, color: C.muted,
                    fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3,
                  }}>
                    <th style={thStyle}>Cidade</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Rotas</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Km/ano</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>R$/km</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {operacional.map(op => (
                    <tr key={op.cidade} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ ...tdStyle, fontWeight: 600, color: C.ink }}>{op.cidade}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(op.rotas)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{op.km > 0 ? fmtNum(op.km) : '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {op.valorMedioKm > 0
                          ? `R$ ${op.valorMedioKm.toFixed(2).replace('.', ',')}`
                          : '—'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: C.green }}>
                        {fmtReal(op.faturamento)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: `${C.green}10`, borderTop: `2px solid ${C.green}40` }}>
                    <td style={{ ...tdStyle, fontWeight: 700, color: C.green }}>TOTAL</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: C.green }}>{fmtNum(totalRotas)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: C.green }}>{quilometragemAnual > 0 ? fmtNum(quilometragemAnual) : '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: C.green }}>
                      {quilometragemAnual > 0
                        ? `R$ ${(faturamentoAnual / quilometragemAnual).toFixed(2).replace('.', ',')}`
                        : '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: C.green }}>{fmtReal(faturamentoAnual)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Secao>

          {/* ==== Histórico de Reajustes ==== */}
          {reajustes.length > 0 && (
            <Secao titulo="📈 Histórico de Reajustes" sub="Reajustes aplicados nos contratos ativos">
              <div style={{ display: 'grid', gap: 8 }}>
                {reajustes.slice(0, 10).map((r, idx) => (
                  <div key={idx} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', background: C.bgPanel2,
                    border: `1px solid ${C.border}`, borderRadius: 6, gap: 12, flexWrap: 'wrap',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: '#fff',
                        background: `linear-gradient(135deg, ${C.accent} 0%, ${C.accent3} 100%)`,
                        padding: '4px 10px', borderRadius: 4,
                        boxShadow: `0 2px 6px ${C.accent}40`,
                      }}>
                        {r.percentual.toFixed(2).replace('.', ',')}% {r.indice}
                      </span>
                      <span style={{ fontSize: 13, color: C.ink2 }}>
                        <strong style={{ color: C.ink }}>{r.contratante}</strong>
                        {r.numero && <span style={{ color: C.muted }}> · Nº {r.numero}</span>}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: C.muted }}>{fmtData(r.data)}</span>
                  </div>
                ))}
              </div>
              {reajustes.length > 10 && (
                <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: C.muted }}>
                  Mostrando os 10 mais recentes de {reajustes.length} reajustes
                </div>
              )}
            </Secao>
          )}

        </div>
      </div>
    </>
  )
}

// ====================================================================
// Componentes auxiliares
// ====================================================================

const KPIGrande = ({ titulo, valor, sub, cor, icone, highlight }: {
  titulo: string; valor: string; sub: string; cor: string; icone: string; highlight?: boolean
}) => (
  <div style={{
    background: highlight
      ? `linear-gradient(135deg, ${C.bgPanel2} 0%, ${C.bgPanel} 100%)`
      : C.bgPanel,
    padding: 18, borderRadius: 12,
    border: `1px solid ${C.border}`,
    borderTop: `2px solid ${cor}`,
    minWidth: 0,
    position: 'relative',
    overflow: 'hidden',
    boxShadow: highlight ? `0 4px 20px ${cor}20` : 'none',
  }}>
    {highlight && (
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${cor}80 50%, transparent)`,
      }} />
    )}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {titulo}
      </div>
      <span style={{ fontSize: 20 }}>{icone}</span>
    </div>
    <div style={{
      fontSize: 24, fontWeight: 700, color: cor,
      marginTop: 8, wordBreak: 'break-word',
      fontFamily: 'monospace', letterSpacing: '-0.025em',
    }}>{valor}</div>
    <div style={{ fontSize: 11, color: C.ink2, marginTop: 6 }}>{sub}</div>
  </div>
)

const Secao = ({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) => (
  <div style={{
    background: C.bgPanel, borderRadius: 12, padding: 18,
    border: `1px solid ${C.border}`,
    width: '100%', minWidth: 0, boxSizing: 'border-box',
  }}>
    <div style={{
      marginBottom: 16, paddingBottom: 12,
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{titulo}</div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
    {children}
  </div>
)

const Vazio = ({ texto }: { texto: string }) => (
  <div style={{ padding: 30, textAlign: 'center', color: C.muted, fontSize: 13 }}>{texto}</div>
)

const thStyle: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', color: C.ink2,
}
