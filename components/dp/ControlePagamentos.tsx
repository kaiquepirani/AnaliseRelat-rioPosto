'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Colaborador, Cidade } from '@/lib/dp-types'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtK = (v: number) => v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : fmt(v)

const CIDADES_ORDEM: Cidade[] = [
  'Águas de Lindóia (Folha)', 'Águas de Lindóia (Diárias)', 'Morungaba',
  'Mogi Mirim', 'Itapira (Escolar)', 'Itapira (Saúde)', 'Aguaí',
  'Casa Branca', 'Pinhal', 'Ubatuba', 'Porto Ferreira', 'Lindóia', 'Mococa', 'Rio Claro',
]

interface Fechamento {
  id: string
  mesAno: string
  tipo: 'antecipacao' | 'folha'
  totalGeral: number
  totalPorCidade: Record<string, number>
  valorPorColaborador?: Record<string, number>
  arquivo: string
  dataImport: string
}

interface HistoricoItem {
  mesAno: string
  antecipacao: number | null
  folha: number | null
  total: number
  arquivoAntecip?: string
  arquivoFolha?: string
}

function mesAnoAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function labelMesAno(ma: string) {
  const [ano, mes] = ma.split('-')
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  return `${nomes[parseInt(mes) - 1]}/${ano}`
}

function labelMesCurto(ma: string) {
  const [ano, mes] = ma.split('-')
  const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${nomes[parseInt(mes) - 1]}/${ano.slice(2)}`
}

function mesAnoAnterior(ma: string) {
  const [ano, mes] = ma.split('-').map(Number)
  if (mes === 1) return `${ano - 1}-12`
  return `${ano}-${String(mes - 1).padStart(2, '0')}`
}

// ─── Modal de histórico do colaborador ──────────────────────────────────────
function ModalHistorico({
  colaborador,
  fechamentos,
  onFechar,
}: {
  colaborador: Colaborador
  fechamentos: Fechamento[]
  onFechar: () => void
}) {
  const nomeKey = colaborador.nome.trim().toUpperCase()

  const historico = useMemo((): HistoricoItem[] => {
    const mesesSet = Array.from(new Set(fechamentos.map(f => f.mesAno))).sort().reverse()
    const resultado: HistoricoItem[] = []
    for (const mes of mesesSet) {
      const fAntecip = fechamentos.find(f => f.mesAno === mes && f.tipo === 'antecipacao')
      const fFolha   = fechamentos.find(f => f.mesAno === mes && f.tipo === 'folha')
      const antecipacao = fAntecip?.valorPorColaborador?.[nomeKey] ?? null
      const folha       = fFolha?.valorPorColaborador?.[nomeKey] ?? null
      if (antecipacao === null && folha === null) continue
      resultado.push({
        mesAno: mes,
        antecipacao,
        folha,
        total: (antecipacao ?? 0) + (folha ?? 0),
        arquivoAntecip: fAntecip?.arquivo,
        arquivoFolha: fFolha?.arquivo,
      })
    }
    return resultado
  }, [fechamentos, nomeKey])

  const totalGeral   = historico.reduce((s, h) => s + h.total, 0)
  const totalAntecip = historico.reduce((s, h) => s + (h.antecipacao ?? 0), 0)
  const totalFolha   = historico.reduce((s, h) => s + (h.folha ?? 0), 0)

  // Fechar com Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onFechar])

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => { if (e.target === e.currentTarget) onFechar() }}
    >
      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,40,0.55)', backdropFilter: 'blur(4px)' }} />

      {/* Painel */}
      <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>

        {/* Header do modal */}
        <div style={{ background: 'var(--navy)', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'white', letterSpacing: '-0.01em' }}>{colaborador.nome}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{colaborador.cidade}</span>
              {colaborador.funcao && (
                <span style={{ fontSize: 11, fontWeight: 600, background: 'rgba(74,171,219,0.25)', color: '#4AABDB', borderRadius: 6, padding: '1px 8px' }}>{colaborador.funcao}</span>
              )}
              {colaborador.cpf && (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>{colaborador.cpf}</span>
              )}
            </div>
          </div>
          <button onClick={onFechar} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', fontSize: 18, flexShrink: 0 }}>✕</button>
        </div>

        {/* Cards de resumo */}
        <div style={{ padding: '1rem 1.5rem', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '0.75rem', border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Total recebido</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--navy)' }}>{fmt(totalGeral)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{historico.length} mese{historico.length !== 1 ? 's' : ''}</div>
          </div>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '0.75rem', border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Antecipações</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#d97706' }}>{fmt(totalAntecip)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>dia 20 do mês</div>
          </div>
          <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '0.75rem', border: '1px solid var(--border)', textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Complementos</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#16a34a' }}>{fmt(totalFolha)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>dia 10 mês seguinte</div>
          </div>
        </div>

        {/* Dados bancários */}
        {(colaborador.banco || colaborador.pix) && (
          <div style={{ padding: '0.75rem 1.5rem', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>💳 Dados bancários</span>
            {colaborador.banco && <span style={{ fontSize: 12, color: '#166534' }}>{colaborador.banco}</span>}
            {colaborador.agencia && <span style={{ fontSize: 12, color: '#166534' }}>Ag {colaborador.agencia}{colaborador.conta ? ` · C ${colaborador.conta}` : ''}</span>}
            {colaborador.pix && <span style={{ fontSize: 12, color: '#166534' }}>PIX: {colaborador.pix}</span>}
          </div>
        )}

        {/* Histórico */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {historico.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-3)' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
              <div style={{ fontWeight: 600 }}>Nenhum pagamento registrado</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Os valores aparecem após importar as folhas Excel</div>
            </div>
          ) : (
            <table className="tabela tabela-sm" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ paddingLeft: '1.5rem' }}>Competência</th>
                  <th style={{ textAlign: 'right' }}>Antecipação</th>
                  <th style={{ textAlign: 'right' }}>Complemento</th>
                  <th style={{ textAlign: 'right', paddingRight: '1.5rem', color: 'var(--navy)' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h, i) => (
                  <tr key={i}>
                    <td style={{ paddingLeft: '1.5rem' }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{labelMesAno(h.mesAno)}</div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {h.antecipacao !== null ? (
                        <div style={{ fontWeight: 600, color: '#d97706' }}>{fmt(h.antecipacao)}</div>
                      ) : (
                        <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {h.folha !== null ? (
                        <div style={{ fontWeight: 600, color: '#16a34a' }}>{fmt(h.folha)}</div>
                      ) : (
                        <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: '1.5rem' }}>
                      <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--navy)' }}>{fmt(h.total)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--sky-light)' }}>
                  <td style={{ paddingLeft: '1.5rem', fontWeight: 700 }}>TOTAL GERAL</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#d97706' }}>{fmt(totalAntecip)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{fmt(totalFolha)}</td>
                  <td style={{ textAlign: 'right', paddingRight: '1.5rem', fontWeight: 800, color: 'var(--navy)' }}>{fmt(totalGeral)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function ControlePagamentos({ onReimportar }: { onReimportar?: (mesAno: string) => void }) {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([])
  const [mesAno, setMesAno] = useState(mesAnoAtual())
  const [carregando, setCarregando] = useState(true)
  const [cidadeExpandida, setCidadeExpandida] = useState<Cidade | null>(null)
  const [colaboradorModal, setColaboradorModal] = useState<Colaborador | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [colabs, fechs] = await Promise.all([
      fetch('/api/dp/colaboradores').then(r => r.json()),
      fetch('/api/dp/fechamentos').then(r => r.json()),
    ])
    setColaboradores(colabs)
    setFechamentos(fechs)
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const fechAntecip = useMemo(() =>
    fechamentos.find(f => f.mesAno === mesAno && f.tipo === 'antecipacao'),
  [fechamentos, mesAno])

  const fechFolha = useMemo(() =>
    fechamentos.find(f => f.mesAno === mesAno && f.tipo === 'folha'),
  [fechamentos, mesAno])

  const totalAntecip = fechAntecip?.totalGeral ?? null
  const totalFolha   = fechFolha?.totalGeral ?? null
  const totalMes     = (totalAntecip ?? 0) + (totalFolha ?? 0)

  const porCidade = useMemo(() => {
    return CIDADES_ORDEM.map(cidade => {
      const membros = colaboradores.filter(c => c.cidade === cidade && c.status === 'ativo')
      const antecip = fechAntecip?.totalPorCidade?.[cidade] ?? null
      const folha   = fechFolha?.totalPorCidade?.[cidade] ?? null
      return { cidade, membros, antecip, folha }
    }).filter(g => g.membros.length > 0 || g.antecip !== null || g.folha !== null)
  }, [colaboradores, fechAntecip, fechFolha])

  const mesesDisponiveis = useMemo(() => {
    const lista: string[] = []
    let ma = mesAnoAtual()
    for (let i = 0; i < 24; i++) { lista.push(ma); ma = mesAnoAnterior(ma) }
    return lista
  }, [])

  const inputStyle = { padding: '0.4rem 0.7rem', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text)' }
  const semDados = !fechAntecip && !fechFolha

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Modal histórico */}
      {colaboradorModal && (
        <ModalHistorico
          colaborador={colaboradorModal}
          fechamentos={fechamentos}
          onFechar={() => setColaboradorModal(null)}
        />
      )}

      {/* ── Seletor de mês ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.875rem 1rem', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', boxShadow: 'var(--shadow-sm)' }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Competência:</label>
        <select value={mesAno} onChange={e => setMesAno(e.target.value)} style={{ ...inputStyle, fontSize: 13, fontWeight: 600 }}>
          {mesesDisponiveis.map(ma => <option key={ma} value={ma}>{labelMesAno(ma)}</option>)}
        </select>

        {onReimportar && (
          <button onClick={() => onReimportar(mesAno)} style={{ padding: '0.4rem 0.875rem', fontSize: 12, fontWeight: 600, background: 'var(--sky-light)', color: 'var(--navy)', border: '1px solid var(--sky-mid)', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Reimportar folha
          </button>
        )}

        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
          Antecipação: dia 20/{mesAno.split('-')[1]} · Complemento: dia 10/{String(parseInt(mesAno.split('-')[1]) % 12 + 1).padStart(2, '0')}
        </div>
      </div>

      {/* ── Aviso sem dados ── */}
      {semDados && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '0.875rem 1rem', display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: '#92400e' }}>
          <span style={{ fontSize: 18 }}>📂</span>
          <div>
            <strong>Nenhuma folha importada para {labelMesAno(mesAno)}.</strong>
            <span style={{ color: '#b45309', marginLeft: 6 }}>Importe a planilha para ver os valores.</span>
          </div>
        </div>
      )}

      {/* ── 3 Cards principais ── */}
      <div className="cards-grid">
        <div className="card" style={{ borderColor: totalAntecip ? '#fcd34d' : undefined }}>
          <div className="card-label">💰 Antecipação Salarial</div>
          {totalAntecip ? (
            <>
              <div className="card-valor" style={{ fontSize: 20, color: '#d97706' }}>{fmt(totalAntecip)}</div>
              <div className="card-sub">dia 20/{mesAno.split('-')[1]} · {fechAntecip && new Date(fechAntecip.dataImport).toLocaleDateString('pt-BR')}</div>
            </>
          ) : (
            <>
              <div className="card-valor" style={{ fontSize: 16, color: 'var(--text-3)' }}>—</div>
              <div className="card-sub" style={{ color: '#d97706' }}>aguardando importação</div>
            </>
          )}
        </div>

        <div className="card" style={{ borderColor: totalFolha ? '#86efac' : undefined }}>
          <div className="card-label">📋 Complemento Salarial</div>
          {totalFolha ? (
            <>
              <div className="card-valor" style={{ fontSize: 20, color: '#16a34a' }}>{fmt(totalFolha)}</div>
              <div className="card-sub">dia 10/{String(parseInt(mesAno.split('-')[1]) % 12 + 1).padStart(2, '0')} · {fechFolha && new Date(fechFolha.dataImport).toLocaleDateString('pt-BR')}</div>
            </>
          ) : (
            <>
              <div className="card-valor" style={{ fontSize: 16, color: 'var(--text-3)' }}>—</div>
              <div className="card-sub" style={{ color: '#16a34a' }}>importar folha do mês seguinte</div>
            </>
          )}
        </div>

        <div className="card" style={{ background: totalMes > 0 ? 'var(--navy)' : undefined, border: 'none', gridColumn: '1 / -1' }}>
          <div className="card-label" style={{ color: totalMes > 0 ? 'rgba(255,255,255,0.6)' : undefined }}>🏦 Total Pago em {labelMesAno(mesAno)}</div>
          {totalMes > 0 ? (
            <>
              <div className="card-valor" style={{ fontSize: 26, color: '#4AABDB' }}>{fmt(totalMes)}</div>
              <div className="card-sub" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {totalAntecip ? `Antecipação ${fmt(totalAntecip)}` : ''}
                {totalAntecip && totalFolha ? ' + ' : ''}
                {totalFolha ? `Complemento ${fmt(totalFolha)}` : ''}
              </div>
            </>
          ) : (
            <>
              <div className="card-valor" style={{ fontSize: 18, color: 'var(--text-3)' }}>—</div>
              <div className="card-sub">nenhuma folha importada</div>
            </>
          )}
        </div>
      </div>

      {/* ── Lista por cidade ── */}
      {carregando ? (
        <div className="estado-vazio">Carregando...</div>
      ) : porCidade.length === 0 ? (
        <div className="estado-vazio">
          <div className="estado-icone">📋</div>
          <div className="estado-titulo">Nenhum colaborador ativo</div>
          <div className="estado-desc">Importe uma folha Excel para começar</div>
        </div>
      ) : (
        porCidade.map(({ cidade, membros, antecip, folha }) => {
          const aberta = cidadeExpandida === cidade
          const totalCidade = (antecip ?? 0) + (folha ?? 0)

          return (
            <div key={cidade} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>

              {/* Header cidade */}
              <div
                style={{ padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', gap: 12, cursor: membros.length > 0 ? 'pointer' : 'default' }}
                onClick={() => membros.length > 0 && setCidadeExpandida(aberta ? null : cidade)}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{cidade}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{membros.length} colaborador{membros.length !== 1 ? 'es' : ''}</div>
                </div>

                <div style={{ textAlign: 'center', minWidth: 130 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 2 }}>Antecipação</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: antecip ? '#d97706' : 'var(--text-3)' }}>{antecip ? fmt(antecip) : '—'}</div>
                </div>

                <div style={{ width: 1, height: 32, background: 'var(--border)' }} />

                <div style={{ textAlign: 'center', minWidth: 130 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 2 }}>Complemento</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: folha ? '#16a34a' : 'var(--text-3)' }}>{folha ? fmt(folha) : '—'}</div>
                </div>

                <div style={{ width: 1, height: 32, background: 'var(--border)' }} />

                <div style={{ textAlign: 'center', minWidth: 130 }}>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 2 }}>Total</div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: totalCidade > 0 ? 'var(--navy)' : 'var(--text-3)' }}>{totalCidade > 0 ? fmt(totalCidade) : '—'}</div>
                </div>

                {membros.length > 0 && (
                  <span style={{ color: 'var(--text-3)', fontSize: 12, marginLeft: 4 }}>{aberta ? '▲' : '▼'}</span>
                )}
              </div>

              {/* ── Tabela expandida com colunas antecipação + complemento + total ── */}
              {aberta && membros.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  {/* Instrução sutil */}
                  <div style={{ padding: '0.5rem 1.25rem', background: 'var(--sky-light)', fontSize: 11, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--border)' }}>
                    <span>💡</span> Clique em um colaborador para ver o histórico completo de pagamentos
                  </div>
                  <table className="tabela tabela-sm">
                    <thead>
                      <tr>
                        <th>Colaborador</th>
                        <th style={{ textAlign: 'right' }}>Antecipação</th>
                        <th style={{ textAlign: 'right' }}>Complemento</th>
                        <th style={{ textAlign: 'right', color: 'var(--navy)' }}>Total</th>
                        <th>Banco / PIX</th>
                      </tr>
                    </thead>
                    <tbody>
                      {membros.map(c => {
                        const nomeKey = c.nome.trim().toUpperCase()
                        const valorAntecip = fechAntecip?.valorPorColaborador?.[nomeKey] ?? null
                        const valorFolha   = fechFolha?.valorPorColaborador?.[nomeKey] ?? null
                        const totalColab   = (valorAntecip ?? 0) + (valorFolha ?? 0)
                        const temValorReal = valorAntecip !== null || valorFolha !== null

                        return (
                          <tr
                            key={c.id}
                            onClick={() => setColaboradorModal(c)}
                            style={{ cursor: 'pointer' }}
                            title="Ver histórico completo"
                          >
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{c.nome}</div>
                              {c.cpf && <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>{c.cpf}</div>}
                              {c.observacoes && <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 2 }}>⭐ {c.observacoes}</div>}
                            </td>

                            {/* Antecipação */}
                            <td style={{ textAlign: 'right' }}>
                              {valorAntecip !== null ? (
                                <div style={{ fontWeight: 700, fontSize: 13, color: '#d97706' }}>{fmt(valorAntecip)}</div>
                              ) : (
                                <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>
                              )}
                            </td>

                            {/* Complemento */}
                            <td style={{ textAlign: 'right' }}>
                              {valorFolha !== null ? (
                                <div style={{ fontWeight: 700, fontSize: 13, color: '#16a34a' }}>{fmt(valorFolha)}</div>
                              ) : (
                                <span style={{ color: 'var(--text-3)', fontSize: 12 }}>—</span>
                              )}
                            </td>

                            {/* Total */}
                            <td style={{ textAlign: 'right' }}>
                              {temValorReal ? (
                                <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--navy)' }}>{fmt(totalColab)}</div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-2)' }}>{fmt(c.salarioBase)}</div>
                                  <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>não importado</div>
                                </div>
                              )}
                            </td>

                            {/* Banco */}
                            <td style={{ fontSize: 12 }}>
                              {c.banco && <div>{c.banco}</div>}
                              {c.agencia && <div style={{ color: 'var(--text-3)' }}>Ag {c.agencia}{c.conta ? ` · C ${c.conta}` : ''}</div>}
                              {c.pix && <div style={{ color: 'var(--text-3)' }}>PIX: {c.pix}</div>}
                              {!c.banco && !c.pix && <span style={{ color: 'var(--text-3)' }}>—</span>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'var(--sky-light)' }}>
                        <td style={{ fontWeight: 700 }}>TOTAL {cidade.toUpperCase()}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#d97706' }}>{antecip ? fmt(antecip) : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{folha ? fmt(folha) : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--navy)' }}>{totalCidade > 0 ? fmt(totalCidade) : '—'}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )
        })
      )}

      {/* ── Rodapé total geral ── */}
      {totalMes > 0 && (
        <div style={{ background: 'var(--navy)', borderRadius: 12, padding: '1rem 1.5rem', display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600, flex: 1 }}>TOTAL GERAL — {labelMesAno(mesAno)}</div>
          {totalAntecip && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Antecipação</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fcd34d' }}>{fmt(totalAntecip)}</div>
            </div>
          )}
          {totalAntecip && totalFolha && <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.15)' }} />}
          {totalFolha && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Complemento</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#86efac' }}>{fmt(totalFolha)}</div>
            </div>
          )}
          <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.15)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Total do mês</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#4AABDB' }}>{fmt(totalMes)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
