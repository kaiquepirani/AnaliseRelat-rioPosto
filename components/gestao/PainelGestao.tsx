'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  BASES_PADRAO, consolidar, MULTIPLICADOR_ENCARGOS, ANO_GESTAO,
  type ConsolidadoCompleto,
} from '@/lib/gestao-types'

interface Props {
  token: string
  onLogout: () => void
}

const NOMES_MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

const fmtReal = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtRealK = (n: number) => {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(2).replace('.', ',')}M`
  if (abs >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}K`
  return fmtReal(n)
}

export default function PainelGestao({ token, onLogout }: Props) {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [comEncargos, setComEncargos] = useState(true)
  const [consolidado, setConsolidado] = useState<ConsolidadoCompleto | null>(null)

  // Guardamos os dados crus pra seção de diagnóstico
  const [debugExtratos, setDebugExtratos] = useState<any[]>([])
  const [debugFaturamento, setDebugFaturamento] = useState<any>(null)
  const [debugPagamentos, setDebugPagamentos] = useState<any[]>([])
  const [debugAberto, setDebugAberto] = useState(false)

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const [resFat, resExt, resPag] = await Promise.all([
        fetch('/api/faturamento', { headers }),
        fetch('/api/extratos', { headers }),
        fetch('/api/dp/pagamentos', { headers }),
      ])

      if (resFat.status === 401) { onLogout(); return }

      const faturamento = resFat.ok ? await resFat.json() : null
      const extratos = resExt.ok ? await resExt.json() : []
      const pagamentos = resPag.ok ? await resPag.json() : []

      setDebugExtratos(Array.isArray(extratos) ? extratos : [])
      setDebugFaturamento(faturamento)
      setDebugPagamentos(Array.isArray(pagamentos) ? pagamentos : [])

      const cons = consolidar({
        ano: ANO_GESTAO,
        faturamento,
        extratos: Array.isArray(extratos) ? extratos : [],
        pagamentos: Array.isArray(pagamentos) ? pagamentos : [],
        bases: BASES_PADRAO,
      })
      setConsolidado(cons)
    } catch (e: any) {
      setErro(e?.message || 'Erro ao carregar dados')
    } finally {
      setCarregando(false)
    }
  }, [headers, onLogout])

  useEffect(() => { carregar() }, [carregar])

  const fator = comEncargos ? MULTIPLICADOR_ENCARGOS : 1

  const kpis = useMemo(() => {
    if (!consolidado) return null
    const t = consolidado.totaisGerais
    const folha = t.totalFolhaLiquida * fator
    const margem = t.totalReceita - t.totalCombustivel - folha
    const margemPct = t.totalReceita > 0 ? (margem / t.totalReceita) * 100 : 0
    return {
      receita: t.totalReceita,
      combustivel: t.totalCombustivel,
      folha,
      margem,
      margemPct,
      pctCombustivel: t.totalReceita > 0 ? (t.totalCombustivel / t.totalReceita) * 100 : 0,
      pctFolha: t.totalReceita > 0 ? (folha / t.totalReceita) * 100 : 0,
    }
  }, [consolidado, fator])

  const dadosGrafico = useMemo(() => {
    if (!consolidado) return []
    return consolidado.totaisPorMes.map((m, i) => {
      const folha = m.folhaLiquida * fator
      const margem = m.receita - m.combustivel - folha
      return {
        mes: NOMES_MESES[i],
        Receita: m.receita,
        Combustível: m.combustivel,
        Folha: folha,
        Margem: margem,
      }
    })
  }, [consolidado, fator])

  const dadosTabela = useMemo(() => {
    if (!consolidado) return []
    return consolidado.bases.map(b => {
      const folha = b.totalFolhaLiquida * fator
      const margem = b.totalReceita - b.totalCombustivel - folha
      const margemPct = b.totalReceita > 0 ? (margem / b.totalReceita) * 100 : null
      return { ...b, folha, margem, margemPct }
    }).sort((a, b) => b.margem - a.margem)
  }, [consolidado, fator])

  const ultimoMesComDado = useMemo(() => {
    if (!consolidado) return -1
    for (let i = 11; i >= 0; i--) {
      const m = consolidado.totaisPorMes[i]
      if ((m.receita + m.combustivel + m.folhaLiquida) > 0) return i
    }
    return -1
  }, [consolidado])

  // Análise dos extratos pro diagnóstico
  const debugInfo = useMemo(() => {
    if (debugExtratos.length === 0) return null

    const primeiroExt = debugExtratos[0]
    const chavesDoExtrato = primeiroExt ? Object.keys(primeiroExt) : []

    let primeiroPosto: any = null
    let chavesDoPosto: string[] = []
    if (primeiroExt) {
      if (Array.isArray(primeiroExt.postos) && primeiroExt.postos.length > 0) {
        primeiroPosto = primeiroExt.postos[0]
      } else if (primeiroExt.posto) {
        primeiroPosto = primeiroExt.posto
      }
      if (primeiroPosto) chavesDoPosto = Object.keys(primeiroPosto)
    }

    let primeiroLanc: any = null
    let chavesDoLanc: string[] = []
    if (primeiroPosto) {
      // tenta encontrar lançamentos em vários nomes possíveis
      const candidatosLancs = ['lancamentos', 'transacoes', 'abastecimentos', 'items', 'itens', 'rows', 'movimentos']
      for (let i = 0; i < candidatosLancs.length; i++) {
        const arr = primeiroPosto[candidatosLancs[i]]
        if (Array.isArray(arr) && arr.length > 0) {
          primeiroLanc = arr[0]
          break
        }
      }
      // fallback: procura no extrato root
      if (!primeiroLanc) {
        for (let i = 0; i < candidatosLancs.length; i++) {
          const arr = primeiroExt[candidatosLancs[i]]
          if (Array.isArray(arr) && arr.length > 0) {
            primeiroLanc = arr[0]
            break
          }
        }
      }
      if (primeiroLanc) chavesDoLanc = Object.keys(primeiroLanc)
    }

    // Tenta detectar os anos presentes nos lancamentos do primeiro extrato
    const anosDetectados = new Set<string>()
    if (primeiroPosto) {
      const candidatosLancs = ['lancamentos', 'transacoes', 'abastecimentos', 'items', 'itens', 'rows', 'movimentos']
      for (let i = 0; i < candidatosLancs.length; i++) {
        const arr = primeiroPosto[candidatosLancs[i]]
        if (Array.isArray(arr)) {
          for (let j = 0; j < Math.min(arr.length, 50); j++) {
            const lanc = arr[j]
            if (lanc && lanc.data) {
              const ms = String(lanc.data).match(/(\d{4})/)
              if (ms) anosDetectados.add(ms[1])
            }
          }
          break
        }
      }
    }

    return {
      qtdExtratos: debugExtratos.length,
      chavesDoExtrato,
      primeiroExtPostosLength: Array.isArray(primeiroExt?.postos) ? primeiroExt.postos.length : null,
      primeiroExtTemPostoSingular: primeiroExt?.posto != null,
      chavesDoPosto,
      primeiroPostoNome: primeiroPosto?.nome,
      chavesDoLanc,
      primeiroLanc,
      anosDetectados: Array.from(anosDetectados).sort(),
    }
  }, [debugExtratos])

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6fb', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <header style={{
        background: '#2D3A6B', padding: '16px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Image src="/logo.png" alt="ETCO" width={48} height={48}
            style={{ objectFit: 'contain', background: '#fff', borderRadius: 8, padding: 4 }} />
          <div>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>📈 Gestão Operacional {ANO_GESTAO}</div>
            <div style={{ color: '#a8b5d9', fontSize: 12 }}>Receita × Custos por base operacional</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/" style={headerBtn}>← Início</Link>
          <button onClick={onLogout} style={{ ...headerBtn, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Sair</button>
        </div>
      </header>

      <main style={{ maxWidth: 1280, margin: '0 auto', padding: 24 }}>

        {/* Toggle folha + atualizar */}
        <div style={{
          background: '#fff', padding: 14, borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)', marginBottom: 16,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Folha:</span>
            <button onClick={() => setComEncargos(false)} style={toggleStyle(!comEncargos, '#0369a1')}>
              Líquida
            </button>
            <button onClick={() => setComEncargos(true)} style={toggleStyle(comEncargos, '#7c3aed')}>
              × 1,7 (com encargos estimados)
            </button>
            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>
              {comEncargos
                ? 'simula INSS, FGTS, férias, 13º — aproximação para visão de custo real'
                : 'apenas o líquido pago, sem encargos'}
            </span>
          </div>
          <button onClick={carregar} disabled={carregando} style={{
            padding: '8px 16px', background: carregando ? '#94a3b8' : '#10b981',
            color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: carregando ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            whiteSpace: 'nowrap',
          }}>
            {carregando ? '⏳ Atualizando...' : '🔄 Atualizar dados'}
          </button>
        </div>

        {erro && (
          <div style={{
            padding: 14, background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 8, color: '#991b1b', fontSize: 13, marginBottom: 16,
          }}>{erro}</div>
        )}

        {carregando && !consolidado ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#64748b', background: '#fff', borderRadius: 12 }}>
            Carregando dados das 3 fontes...
          </div>
        ) : consolidado && kpis ? (
          <>
            {/* KPIs */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12, marginBottom: 16,
            }}>
              <KPI titulo={`Receita ${ANO_GESTAO}`}
                valor={fmtReal(kpis.receita)}
                sub={ultimoMesComDado >= 0 ? `acumulado até ${NOMES_MESES[ultimoMesComDado]}` : ''}
                cor="#047857" icone="💰" />
              <KPI titulo="Custo combustível"
                valor={fmtReal(kpis.combustivel)}
                sub={`${kpis.pctCombustivel.toFixed(1).replace('.', ',')}% da receita`}
                cor="#dc2626" icone="⛽" />
              <KPI titulo={`Custo folha${comEncargos ? ' (×1,7)' : ' líquida'}`}
                valor={fmtReal(kpis.folha)}
                sub={`${kpis.pctFolha.toFixed(1).replace('.', ',')}% da receita`}
                cor="#7c3aed" icone="👥" />
              <KPI titulo="Margem operacional"
                valor={fmtReal(kpis.margem)}
                sub={`${kpis.margemPct.toFixed(1).replace('.', ',')}% da receita`}
                cor={kpis.margem >= 0 ? '#10b981' : '#dc2626'}
                icone={kpis.margem >= 0 ? '📊' : '📉'} />
            </div>

            {/* Aviso de itens órfãos */}
            {(consolidado.postosOrfaos.length > 0 ||
              consolidado.faturamentoLinhasOrfas.length > 0 ||
              consolidado.folhaCidadesOrfas.length > 0) && (
              <div style={{
                marginBottom: 16, padding: '12px 16px',
                background: '#fffbeb', border: '1px solid #fde68a',
                borderLeft: '4px solid #f59e0b', borderRadius: 8,
                fontSize: 13, color: '#92400e',
              }}>
                <strong>⚠️ Itens encontrados nos dados que não foram atribuídos a nenhuma base:</strong>
                {consolidado.postosOrfaos.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    <strong>Postos:</strong> {consolidado.postosOrfaos.join(' · ')}
                  </div>
                )}
                {consolidado.faturamentoLinhasOrfas.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 12 }}>
                    <strong>Linhas de faturamento:</strong> {consolidado.faturamentoLinhasOrfas.join(' · ')}
                  </div>
                )}
                {consolidado.folhaCidadesOrfas.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 12 }}>
                    <strong>Cidades de folha (em pagamentos):</strong> {consolidado.folhaCidadesOrfas.join(' · ')}
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: 11, opacity: 0.85 }}>
                  Esses valores não estão sendo somados em nenhuma base. Atualize o mapeamento em <code>lib/gestao-types.ts</code> se necessário.
                </div>
              </div>
            )}

            {/* ───── Painel de diagnóstico (expansível) ───── */}
            <div style={{
              marginBottom: 16, background: '#fff', borderRadius: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden',
              border: '2px dashed #cbd5e1',
            }}>
              <button onClick={() => setDebugAberto(!debugAberto)}
                style={{
                  width: '100%', padding: '12px 16px', background: '#f8fafc',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  fontSize: 13, fontWeight: 600, color: '#334155',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontFamily: 'inherit',
                }}>
                <span>🔍 Diagnóstico — clique para inspecionar a estrutura dos dados</span>
                <span>{debugAberto ? '▲' : '▼'}</span>
              </button>
              {debugAberto && (
                <div style={{ padding: 16, fontSize: 12, fontFamily: 'monospace', background: '#0f172a', color: '#e2e8f0' }}>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ color: '#fbbf24', fontWeight: 700, marginBottom: 4 }}>
                      📦 EXTRATOS — total: {debugInfo?.qtdExtratos ?? 0}
                    </div>
                    {debugInfo && (
                      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
{`Chaves do primeiro extrato: ${JSON.stringify(debugInfo.chavesDoExtrato)}
Tem array postos[]? ${debugInfo.primeiroExtPostosLength != null ? `sim, ${debugInfo.primeiroExtPostosLength} postos` : 'não'}
Tem objeto posto (singular)? ${debugInfo.primeiroExtTemPostoSingular ? 'sim' : 'não'}

Nome do primeiro posto: ${debugInfo.primeiroPostoNome || '(vazio)'}
Chaves do primeiro posto: ${JSON.stringify(debugInfo.chavesDoPosto)}

Chaves do primeiro lançamento (encontrado): ${JSON.stringify(debugInfo.chavesDoLanc)}

Anos detectados nos lançamentos: ${debugInfo.anosDetectados.join(', ') || '(nenhum)'}

Primeiro lançamento (objeto cru):
${JSON.stringify(debugInfo.primeiroLanc, null, 2)}`}
                      </pre>
                    )}
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <div style={{ color: '#34d399', fontWeight: 700, marginBottom: 4 }}>
                      💵 PAGAMENTOS DP — total: {debugPagamentos.length}
                    </div>
                    {debugPagamentos.length > 0 && (
                      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
{`Primeiro pagamento:
${JSON.stringify(debugPagamentos[0], null, 2)}`}
                      </pre>
                    )}
                  </div>

                  <div>
                    <div style={{ color: '#a78bfa', fontWeight: 700, marginBottom: 4 }}>
                      📊 FATURAMENTO — anos disponíveis
                    </div>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
{`Anos: ${debugFaturamento?.anos ? JSON.stringify(debugFaturamento.anos) : '(nenhum)'}
Tem dados de ${ANO_GESTAO}? ${debugFaturamento?.porAno?.[ANO_GESTAO] ? 'sim' : 'não'}
Linhas em ${ANO_GESTAO}: ${debugFaturamento?.porAno?.[ANO_GESTAO]?.cidades?.length ?? 0}`}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Gráfico de evolução mensal */}
            <Secao titulo={`📊 Evolução mensal — ${ANO_GESTAO}`}
              sub="Receita, combustível, folha e margem por mês">
              <div style={{ width: '100%', height: 360 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosGrafico} margin={{ top: 20, right: 20, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={fmtRealK} tick={{ fontSize: 11 }} width={70} />
                    <Tooltip formatter={(v: any) => fmtReal(Number(v))}
                      contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Receita" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Combustível" fill="#dc2626" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Folha" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Margem" fill="#2D3A6B" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Secao>

            {/* Tabela por base */}
            <Secao titulo="🏢 Resultado por Base Operacional"
              sub="Ranqueado pela margem operacional absoluta">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                      <th style={thStyle}>Base</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Receita</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Combustível</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Folha</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Margem R$</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Margem %</th>
                      <th style={thStyle}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dadosTabela.map(b => {
                      const incompleto = !b.temFaturamentoMapeado || !b.temFolhaMapeada || !b.temPostoMapeado
                      const naoEncontrou =
                        b.postosMapeadosNaoEncontrados.length > 0 ||
                        b.folhaCidadesMapeadasNaoEncontradas.length > 0 ||
                        b.faturamentoLinhasMapeadasNaoEncontradas.length > 0

                      return (
                        <tr key={b.baseId} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ ...tdStyle, fontWeight: 600, color: '#1e293b' }}>
                            {b.baseNome}
                            {b.observacao && (
                              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, fontWeight: 400 }}>
                                {b.observacao}
                              </div>
                            )}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                            {b.totalReceita > 0 ? fmtRealK(b.totalReceita) : '—'}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: '#dc2626' }}>
                            {b.totalCombustivel > 0 ? fmtRealK(b.totalCombustivel) : '—'}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: '#7c3aed' }}>
                            {b.folha > 0 ? fmtRealK(b.folha) : '—'}
                          </td>
                          <td style={{
                            ...tdStyle, textAlign: 'right', fontWeight: 700,
                            color: b.margem >= 0 ? '#047857' : '#dc2626',
                          }}>
                            {fmtRealK(b.margem)}
                          </td>
                          <td style={{
                            ...tdStyle, textAlign: 'right', fontWeight: 600,
                            color: b.margemPct == null ? '#94a3b8' : (b.margemPct >= 0 ? '#047857' : '#dc2626'),
                          }}>
                            {b.margemPct == null ? '—' : `${b.margemPct.toFixed(1).replace('.', ',')}%`}
                          </td>
                          <td style={tdStyle}>
                            {incompleto || naoEncontrou ? (
                              <span style={{
                                fontSize: 10, padding: '2px 6px',
                                background: '#fef3c7', color: '#92400e',
                                borderRadius: 3, fontWeight: 600,
                              }} title={
                                naoEncontrou
                                  ? `Mapeado mas sem dado: ${[
                                      ...b.postosMapeadosNaoEncontrados.map(p => `posto "${p}"`),
                                      ...b.folhaCidadesMapeadasNaoEncontradas.map(c => `folha "${c}"`),
                                      ...b.faturamentoLinhasMapeadasNaoEncontradas.map(l => `faturamento "${l}"`),
                                    ].join(', ')}`
                                  : 'Mapeamento incompleto'
                              }>
                                ⚠ Parcial
                              </span>
                            ) : (
                              <span style={{
                                fontSize: 10, padding: '2px 6px',
                                background: '#dcfce7', color: '#166534',
                                borderRadius: 3, fontWeight: 600,
                              }}>✓ Completa</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 10, fontSize: 10, color: '#94a3b8' }}>
                Passe o mouse sobre &ldquo;⚠ Parcial&rdquo; para ver quais itens do mapeamento ainda não têm dados.
              </div>
            </Secao>

            {/* Metadados */}
            <div style={{
              marginTop: 16, padding: 12, background: '#fff', borderRadius: 8,
              fontSize: 11, color: '#94a3b8', display: 'flex', flexWrap: 'wrap',
              justifyContent: 'space-between', gap: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <span>📦 {consolidado.fontes.qtdExtratos} extratos · {consolidado.fontes.qtdPagamentos} pagamentos em {ANO_GESTAO} · {consolidado.fontes.qtdLinhasFaturamento} linhas de faturamento</span>
              <span>🕐 Atualizado: {new Date(consolidado.ultimaAtualizacao).toLocaleString('pt-BR')}</span>
            </div>
          </>
        ) : null}

      </main>
    </div>
  )
}

// ──────── Componentes auxiliares ────────

const KPI = ({ titulo, valor, sub, cor, icone }: {
  titulo: string; valor: string; sub?: string; cor: string; icone: string
}) => (
  <div style={{
    background: '#fff', padding: 16, borderRadius: 12,
    borderTop: `4px solid ${cor}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    minWidth: 0,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {titulo}
      </div>
      <span style={{ fontSize: 20 }}>{icone}</span>
    </div>
    <div style={{ fontSize: 22, fontWeight: 700, color: cor, marginTop: 8, wordBreak: 'break-word' }}>{valor}</div>
    {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{sub}</div>}
  </div>
)

const Secao = ({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) => (
  <div style={{
    background: '#fff', borderRadius: 12, padding: 16, marginBottom: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  }}>
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{titulo}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
    {children}
  </div>
)

const headerBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.12)', color: '#fff', padding: '8px 14px',
  borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600,
}

const toggleStyle = (ativo: boolean, cor: string): React.CSSProperties => ({
  padding: '6px 12px',
  background: ativo ? cor : '#fff',
  color: ativo ? '#fff' : '#334155',
  border: `1.5px solid ${ativo ? cor : '#e2e8f0'}`,
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
})

const thStyle: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', color: '#334155', whiteSpace: 'nowrap',
}
