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

const PALETA = ['#2D3A6B', '#4AABDB', '#10b981', '#f59e0b', '#7c3aed', '#dc2626', '#0891b2', '#ea580c']

export default function ResumoContratos({ contratos }: Props) {
  // Filtra: apenas vigentes e vencendo (status financeiro ativo)
  const ativos: ContratoComAlerta[] = useMemo(() => {
    return contratos
      .map(calcularSituacao)
      .filter(c => c.situacao === 'vigente' || c.situacao === 'vencendo')
  }, [contratos])

  const totalContratos = ativos.length

  // ==== KPIs principais ====
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

  // ==== Timeline de vencimentos (próximos 18 meses) ====
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

  // ==== Faturamento por contratante (Pizza) ====
  const porContratante = useMemo(() => {
    const mapa: Record<string, number> = {}
    for (const c of ativos) {
      const nome = c.contratante || c.cliente || 'Sem contratante'
      mapa[nome] = (mapa[nome] || 0) + valorTotalAtual(c)
    }
    const entradas = Object.entries(mapa)
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor)
    // Top 5 + outros
    if (entradas.length > 6) {
      const top5 = entradas.slice(0, 5)
      const outrosValor = entradas.slice(5).reduce((acc, e) => acc + e.valor, 0)
      return [...top5, { nome: 'Outros', valor: outrosValor }]
    }
    return entradas
  }, [ativos])

  // ==== Faturamento por cidade (Barras) ====
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

  // ==== Operacional: rotas/km/valor médio por cidade ====
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

  // ==== Histórico de reajustes ====
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

  if (totalContratos === 0) {
    return (
      <div style={{
        padding: 60, textAlign: 'center', color: '#64748b',
        background: '#fff', borderRadius: 12, fontSize: 14,
      }}>
        Nenhum contrato ativo para exibir no resumo.<br />
        <span style={{ fontSize: 12, color: '#94a3b8', marginTop: 8, display: 'inline-block' }}>
          Cadastre contratos vigentes para visualizar o dashboard.
        </span>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 18 }}>

      {/* ==== KPIs Principais ==== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 14,
      }}>
        <KPIGrande titulo="Faturamento Anual" valor={fmtReal(faturamentoAnual)}
          sub={`${totalContratos} ${totalContratos === 1 ? 'contrato ativo' : 'contratos ativos'}`}
          cor="#047857" icone="💰" />
        <KPIGrande titulo="Faturamento Mensal" valor={fmtReal(faturamentoMensal)}
          sub="média mensal" cor="#2D3A6B" icone="📅" />
        <KPIGrande titulo="Total de Rotas" valor={fmtNum(totalRotas)}
          sub="rotas vigentes" cor="#4AABDB" icone="🚌" />
        <KPIGrande titulo="Quilometragem Anual" valor={`${fmtNum(quilometragemAnual)} km`}
          sub="contratada/ano" cor="#7c3aed" icone="📍" />
      </div>

      {/* ==== Timeline de Vencimentos ==== */}
      <Secao titulo="📅 Timeline de Vencimentos" sub="Próximos 18 meses">
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
          {timeline.map(m => {
            const total = m.contratos.length
            const valor = m.contratos.reduce((acc, c) => acc + valorTotalAtual(c), 0)
            const corFundo = total === 0 ? '#f8fafc' : total >= 3 ? '#fef2f2' : total >= 2 ? '#fffbeb' : '#ecfdf5'
            const corBorda = total === 0 ? '#e2e8f0' : total >= 3 ? '#fecaca' : total >= 2 ? '#fde68a' : '#a7f3d0'
            const corTexto = total === 0 ? '#94a3b8' : total >= 3 ? '#b91c1c' : total >= 2 ? '#b45309' : '#047857'
            return (
              <div key={m.mesAno} style={{
                minWidth: 90, background: corFundo, border: `1px solid ${corBorda}`,
                borderRadius: 8, padding: 10, textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{m.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: corTexto, marginTop: 4 }}>
                  {total === 0 ? '—' : total}
                </div>
                <div style={{ fontSize: 10, color: corTexto, fontWeight: 600 }}>
                  {total === 0 ? 'sem vencimentos' : total === 1 ? 'contrato' : 'contratos'}
                </div>
                {valor > 0 && (
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                    {fmtRealCompacto(valor)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {/* Lista detalhada dos vencimentos */}
        {timeline.some(m => m.contratos.length > 0) && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
            <strong style={{ color: '#334155' }}>Vencimentos detalhados:</strong>
            <ul style={{ marginTop: 6, paddingLeft: 18, lineHeight: 1.7 }}>
              {timeline
                .filter(m => m.contratos.length > 0)
                .slice(0, 6)
                .map(m => (
                  <li key={m.mesAno}>
                    <strong>{m.label}</strong>:{' '}
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
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: 14,
      }}>
        <Secao titulo="🥧 Distribuição por Contratante" sub="% do faturamento total">
          {porContratante.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={porContratante} dataKey="valor" nameKey="nome"
                  cx="50%" cy="50%" outerRadius={90} innerRadius={45}
                  label={(entry) => fmtPct((entry.valor / faturamentoAnual) * 100)}
                  labelLine={false}>
                  {porContratante.map((_, idx) => (
                    <Cell key={idx} fill={PALETA[idx % PALETA.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any, name: any) => [fmtReal(Number(value)), name]}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <Vazio texto="Sem dados" />}
          {porContratante.length > 0 && (
            <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
              {porContratante.slice(0, 6).map((p, idx) => (
                <div key={p.nome} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 12, color: '#475569',
                }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: 2,
                    background: PALETA[idx % PALETA.length], flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.nome}
                  </span>
                  <strong>{fmtRealCompacto(p.valor)}</strong>
                </div>
              ))}
            </div>
          )}
        </Secao>

        <Secao titulo="🏙️ Faturamento por Cidade" sub="Valor anual contratado">
          {porCidade.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(220, porCidade.length * 38)}>
              <BarChart data={porCidade} layout="vertical" margin={{ top: 8, right: 50, left: 10, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis type="number" tickFormatter={fmtRealCompacto} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="cidade" tick={{ fontSize: 12 }} width={100} />
                <Tooltip formatter={(v: any) => fmtReal(Number(v))}
                  contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="valor" fill="#2D3A6B" radius={[0, 4, 4, 0]}>
                  <LabelList dataKey="valor" position="right" formatter={fmtRealCompacto}
                    style={{ fontSize: 11, fill: '#334155', fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Vazio texto="Sem dados" />}
        </Secao>
      </div>

      {/* ==== Operacional ==== */}
      <Secao titulo="🚌 Operacional por Cidade" sub="Rotas, quilometragem e valor médio do km">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{
                background: '#f8fafc', color: '#64748b',
                fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3,
              }}>
                <th style={thStyle}>Cidade</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Rotas</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Km/ano</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>R$/km médio</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Faturamento</th>
              </tr>
            </thead>
            <tbody>
              {operacional.map(op => (
                <tr key={op.cidade} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: '#1e293b' }}>{op.cidade}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(op.rotas)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{op.km > 0 ? fmtNum(op.km) : '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {op.valorMedioKm > 0
                      ? `R$ ${op.valorMedioKm.toFixed(2).replace('.', ',')}`
                      : '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#047857' }}>
                    {fmtReal(op.faturamento)}
                  </td>
                </tr>
              ))}
              <tr style={{ background: '#f0fdf4', borderTop: '2px solid #bbf7d0' }}>
                <td style={{ ...tdStyle, fontWeight: 700, color: '#047857' }}>TOTAL</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#047857' }}>{fmtNum(totalRotas)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#047857' }}>{quilometragemAnual > 0 ? fmtNum(quilometragemAnual) : '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#047857' }}>
                  {quilometragemAnual > 0
                    ? `R$ ${(faturamentoAnual / quilometragemAnual).toFixed(2).replace('.', ',')}`
                    : '—'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#047857' }}>{fmtReal(faturamentoAnual)}</td>
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
                padding: '10px 14px', background: '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: 6, gap: 12, flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 14, fontWeight: 700, color: '#fff',
                    background: '#0369a1', padding: '4px 10px', borderRadius: 4,
                  }}>
                    {r.percentual.toFixed(2).replace('.', ',')}% {r.indice}
                  </span>
                  <span style={{ fontSize: 13, color: '#334155' }}>
                    <strong>{r.contratante}</strong>
                    {r.numero && <span style={{ color: '#94a3b8' }}> · Nº {r.numero}</span>}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: '#64748b' }}>{fmtData(r.data)}</span>
              </div>
            ))}
          </div>
          {reajustes.length > 10 && (
            <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
              Mostrando os 10 mais recentes de {reajustes.length} reajustes
            </div>
          )}
        </Secao>
      )}

    </div>
  )
}

// ===== Componentes auxiliares =====

const KPIGrande = ({ titulo, valor, sub, cor, icone }: {
  titulo: string; valor: string; sub: string; cor: string; icone: string
}) => (
  <div style={{
    background: '#fff', padding: 18, borderRadius: 12,
    borderTop: `4px solid ${cor}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {titulo}
      </div>
      <span style={{ fontSize: 22 }}>{icone}</span>
    </div>
    <div style={{ fontSize: 24, fontWeight: 700, color: cor, marginTop: 8 }}>{valor}</div>
    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{sub}</div>
  </div>
)

const Secao = ({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) => (
  <div style={{
    background: '#fff', borderRadius: 12, padding: 18,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  }}>
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{titulo}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
    {children}
  </div>
)

const Vazio = ({ texto }: { texto: string }) => (
  <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>{texto}</div>
)

const thStyle: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', color: '#334155',
}
