'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Colaborador, Lancamento, Pagamento, Cidade, TipoLancamento } from '@/lib/dp-types'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const CIDADES_ORDEM: Cidade[] = [
  'Águas de Lindóia (Folha)', 'Águas de Lindóia (Diárias)', 'Morungaba',
  'Mogi Mirim', 'Itapira (Escolar)', 'Itapira (Saúde)', 'Aguaí',
  'Casa Branca', 'Pinhal', 'Ubatuba', 'Porto Ferreira', 'Lindóia', 'Mococa', 'Rio Claro',
]

const TIPOS_LANCAMENTO: { value: TipoLancamento; label: string; sinal: 1 | -1 }[] = [
  { value: 'diaria',              label: 'Diária',               sinal: 1  },
  { value: 'salario_familia',     label: 'Salário família',       sinal: 1  },
  { value: 'reembolso',           label: 'Reembolso',             sinal: 1  },
  { value: 'bonus',               label: 'Bônus',                 sinal: 1  },
  { value: 'outro_credito',       label: 'Outro crédito',         sinal: 1  },
  { value: 'desconto_falta',      label: 'Desconto falta',        sinal: -1 },
  { value: 'desconto_vale',       label: 'Desconto vale',         sinal: -1 },
  { value: 'desconto_consignado', label: 'Consignado',            sinal: -1 },
  { value: 'desconto_multa',      label: 'Desconto multa',        sinal: -1 },
  { value: 'outro_desconto',      label: 'Outro desconto',        sinal: -1 },
]

interface Fechamento {
  id: string
  mesAno: string
  tipo: 'antecipacao' | 'folha'
  totalGeral: number
  totalPorCidade: Record<string, number>
  arquivo: string
  dataImport: string
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

function mesAnoAnterior(ma: string) {
  const [ano, mes] = ma.split('-').map(Number)
  if (mes === 1) return `${ano - 1}-12`
  return `${ano}-${String(mes - 1).padStart(2, '0')}`
}

export default function ControlePagamentos({ onReimportar }: { onReimportar?: (mesAno: string) => void }) {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [fechamentos, setFechamentos] = useState<Fechamento[]>([])
  const [mesAno, setMesAno] = useState(mesAnoAtual())
  const [carregando, setCarregando] = useState(true)
  const [cidadeExpandida, setCidadeExpandida] = useState<Cidade | null>(null)
  const [adicionandoLanc, setAdicionandoLanc] = useState<string | null>(null)
  const [novoLanc, setNovoLanc] = useState<Partial<Lancamento>>({})
  const [salvando, setSalvando] = useState(false)
  const [registrandoPag, setRegistrandoPag] = useState<{ cidade: Cidade; tipo: 'antecipacao' | 'folha' } | null>(null)
  const [dataPag, setDataPag] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [colabs, lancs, pags, fechs] = await Promise.all([
      fetch('/api/dp/colaboradores').then(r => r.json()),
      fetch(`/api/dp/lancamentos?mesAno=${mesAno}`).then(r => r.json()),
      fetch(`/api/dp/pagamentos?mesAno=${mesAno}`).then(r => r.json()),
      fetch('/api/dp/fechamentos').then(r => r.json()),
    ])
    setColaboradores(colabs)
    setLancamentos(lancs)
    setPagamentos(pags)
    setFechamentos(fechs)
    setCarregando(false)
  }, [mesAno])

  useEffect(() => { carregar() }, [carregar])

  // ── Fechamentos do mês selecionado ──────────────────────────────────────
  const fechamentoAntecipacao = useMemo(() =>
    fechamentos.find(f => f.mesAno === mesAno && f.tipo === 'antecipacao'),
  [fechamentos, mesAno])

  const fechamentoFolha = useMemo(() =>
    fechamentos.find(f => f.mesAno === mesAno && f.tipo === 'folha'),
  [fechamentos, mesAno])

  // ── Valores por cidade vindos dos fechamentos ────────────────────────────
  // Se tem fechamento importado, usa ele como fonte de verdade
  // Se não tem, mostra apenas colaboradores cadastrados sem valor (aguardando importação)
  const porCidade = useMemo(() => {
    return CIDADES_ORDEM.map(cidade => {
      const membros = colaboradores.filter(c => c.cidade === cidade && c.status === 'ativo')

      // Valor real da antecipação: do fechamento importado
      const totalAntecipacao = fechamentoAntecipacao?.totalPorCidade?.[cidade] ?? null
      // Valor real da folha: do fechamento importado
      const totalFolha = fechamentoFolha?.totalPorCidade?.[cidade] ?? null

      const pagAntecipacao = pagamentos.find(p => p.cidade === cidade && p.tipo === 'antecipacao')
      const pagFolha = pagamentos.find(p => p.cidade === cidade && p.tipo === 'folha')

      return { cidade, membros, totalAntecipacao, totalFolha, pagAntecipacao, pagFolha }
    }).filter(g => g.membros.length > 0 || g.totalAntecipacao !== null || g.totalFolha !== null)
  }, [colaboradores, pagamentos, fechamentoAntecipacao, fechamentoFolha])

  // ── Totais gerais dos cards ──────────────────────────────────────────────
  const totalGeralAntecipacao = fechamentoAntecipacao?.totalGeral ?? null
  const totalGeralFolha = fechamentoFolha?.totalGeral ?? null
  const totalPagoAntecipacao = porCidade.filter(c => c.pagAntecipacao && c.totalAntecipacao).reduce((s, c) => s + (c.totalAntecipacao || 0), 0)
  const totalPagoFolha = porCidade.filter(c => c.pagFolha && c.totalFolha).reduce((s, c) => s + (c.totalFolha || 0), 0)
  const cidadesComAntecip = porCidade.filter(c => c.totalAntecipacao !== null).length
  const cidadesComFolha = porCidade.filter(c => c.totalFolha !== null).length

  const salvarLancamento = async () => {
    if (!novoLanc.tipo || !novoLanc.colaboradorId || !novoLanc.valor) return
    setSalvando(true)
    const tipo = TIPOS_LANCAMENTO.find(t => t.value === novoLanc.tipo)!
    const lanc: Lancamento = {
      id: `lanc_${Date.now()}`,
      colaboradorId: novoLanc.colaboradorId!,
      mesAno,
      tipo: novoLanc.tipo!,
      descricao: novoLanc.descricao || tipo.label,
      valor: Math.abs(novoLanc.valor!) * tipo.sinal,
      parcela: novoLanc.parcela,
      createdAt: new Date().toISOString(),
    }
    await fetch('/api/dp/lancamentos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lanc),
    })
    setAdicionandoLanc(null)
    setNovoLanc({})
    await carregar()
    setSalvando(false)
  }

  const removerLancamento = async (id: string) => {
    await fetch('/api/dp/lancamentos', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, mesAno }),
    })
    await carregar()
  }

  const registrarPagamento = async () => {
    if (!registrandoPag || !dataPag) return
    setSalvando(true)
    const cidade = registrandoPag.cidade
    const tipo = registrandoPag.tipo
    const grupo = porCidade.find(g => g.cidade === cidade)!
    const valor = tipo === 'antecipacao' ? (grupo.totalAntecipacao || 0) : (grupo.totalFolha || 0)
    const pag: Pagamento = {
      id: `pag_${Date.now()}`,
      mesAno, cidade, tipo, valor,
      dataPagamento: dataPag,
      createdAt: new Date().toISOString(),
    }
    await fetch('/api/dp/pagamentos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pag),
    })
    setRegistrandoPag(null)
    setDataPag('')
    await carregar()
    setSalvando(false)
  }

  const cancelarPagamento = async (id: string) => {
    if (!confirm('Cancelar este registro de pagamento?')) return
    await fetch('/api/dp/pagamentos', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await carregar()
  }

  const mesesDisponiveis = useMemo(() => {
    const lista = []
    let ma = mesAnoAtual()
    for (let i = 0; i < 12; i++) {
      lista.push(ma)
      ma = mesAnoAnterior(ma)
    }
    return lista
  }, [])

  const inputStyle = { padding: '0.4rem 0.7rem', fontSize: 12, borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text)' }

  const semFechamento = !fechamentoAntecipacao && !fechamentoFolha

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── Seletor de mês ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.875rem 1rem', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', boxShadow: 'var(--shadow-sm)' }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Competência:</label>
        <select value={mesAno} onChange={e => setMesAno(e.target.value)} style={{ ...inputStyle, fontSize: 13, fontWeight: 600 }}>
          {mesesDisponiveis.map(ma => <option key={ma} value={ma}>{labelMesAno(ma)}</option>)}
        </select>

        {/* Botão reimportar folha */}
        {onReimportar && (
          <button
            onClick={() => onReimportar(mesAno)}
            title={`Reimportar folha de ${labelMesAno(mesAno)}`}
            style={{
              padding: '0.4rem 0.875rem', fontSize: 12, fontWeight: 600,
              background: 'var(--sky-light)', color: 'var(--navy)',
              border: '1px solid var(--sky-mid)', borderRadius: 8,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="23 4 23 10 17 10"/>
              <polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Reimportar folha
          </button>
        )}

        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
          Antecipação: dia 20/{mesAno.split('-')[1]} · Folha: dia 10/{String(parseInt(mesAno.split('-')[1]) % 12 + 1).padStart(2, '0')}
        </div>
      </div>

      {/* ── Aviso se não tem fechamento importado ── */}
      {semFechamento && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '0.875rem 1rem', display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: '#92400e' }}>
          <span style={{ fontSize: 18 }}>📂</span>
          <div>
            <strong>Nenhuma folha importada para {labelMesAno(mesAno)}.</strong>
            <span style={{ color: '#b45309', marginLeft: 6 }}>Importe a planilha de antecipação ou folha para ver os valores reais.</span>
          </div>
        </div>
      )}

      {/* ── Cards resumo ── */}
      <div className="cards-grid">

        {/* Antecipação total */}
        <div className="card" style={fechamentoAntecipacao ? { borderColor: '#93c5fd' } : {}}>
          <div className="card-label">Antecipação total (40%)</div>
          {fechamentoAntecipacao ? (
            <>
              <div className="card-valor" style={{ fontSize: 18 }}>{fmt(totalGeralAntecipacao!)}</div>
              <div className="card-sub">dia 20/{mesAno.split('-')[1]} · importado {new Date(fechamentoAntecipacao.dataImport).toLocaleDateString('pt-BR')}</div>
            </>
          ) : (
            <>
              <div className="card-valor" style={{ fontSize: 15, color: 'var(--text-3)' }}>—</div>
              <div className="card-sub" style={{ color: '#d97706' }}>aguardando importação</div>
            </>
          )}
        </div>

        {/* Antecipações pagas */}
        <div className="card" style={{
          borderColor: fechamentoAntecipacao && totalPagoAntecipacao >= (totalGeralAntecipacao || 0) && totalGeralAntecipacao ? '#86efac' : '#fca5a5',
          background: fechamentoAntecipacao && totalPagoAntecipacao >= (totalGeralAntecipacao || 0) && totalGeralAntecipacao ? '#f0fdf4' : undefined,
        }}>
          <div className="card-label">Antecipações pagas</div>
          {fechamentoAntecipacao ? (
            <>
              <div className="card-valor" style={{ fontSize: 18, color: totalPagoAntecipacao >= (totalGeralAntecipacao || 0) ? '#16a34a' : 'var(--navy)' }}>
                {fmt(totalPagoAntecipacao)}
              </div>
              <div className="card-sub">{porCidade.filter(c => c.pagAntecipacao && c.totalAntecipacao).length}/{cidadesComAntecip} cidades</div>
            </>
          ) : (
            <>
              <div className="card-valor" style={{ fontSize: 15, color: 'var(--text-3)' }}>R$ 0,00</div>
              <div className="card-sub">0/{porCidade.length} cidades</div>
            </>
          )}
        </div>

        {/* Folha total */}
        <div className="card" style={fechamentoFolha ? { borderColor: '#93c5fd' } : {}}>
          <div className="card-label">Folha total (60% + aj.)</div>
          {fechamentoFolha ? (
            <>
              <div className="card-valor" style={{ fontSize: 18 }}>{fmt(totalGeralFolha!)}</div>
              <div className="card-sub">dia 10 do mês seguinte · importado {new Date(fechamentoFolha.dataImport).toLocaleDateString('pt-BR')}</div>
            </>
          ) : (
            <>
              <div className="card-valor" style={{ fontSize: 15, color: 'var(--text-3)' }}>—</div>
              <div className="card-sub" style={{ color: '#d97706' }}>importar folha do mês seguinte</div>
            </>
          )}
        </div>

        {/* Folhas pagas */}
        <div className="card" style={{
          borderColor: fechamentoFolha && totalPagoFolha >= (totalGeralFolha || 0) && totalGeralFolha ? '#86efac' : '#fca5a5',
          background: fechamentoFolha && totalPagoFolha >= (totalGeralFolha || 0) && totalGeralFolha ? '#f0fdf4' : undefined,
        }}>
          <div className="card-label">Folhas pagas</div>
          {fechamentoFolha ? (
            <>
              <div className="card-valor" style={{ fontSize: 18, color: totalPagoFolha >= (totalGeralFolha || 0) ? '#16a34a' : 'var(--navy)' }}>
                {fmt(totalPagoFolha)}
              </div>
              <div className="card-sub">{porCidade.filter(c => c.pagFolha && c.totalFolha).length}/{cidadesComFolha} cidades</div>
            </>
          ) : (
            <>
              <div className="card-valor" style={{ fontSize: 15, color: 'var(--text-3)' }}>R$ 0,00</div>
              <div className="card-sub">0/{porCidade.length} cidades</div>
            </>
          )}
        </div>
      </div>

      {/* ── Modal registrar pagamento ── */}
      {registrandoPag && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: 16, padding: '2rem', maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)', marginBottom: '1.25rem' }}>✅ Registrar pagamento</div>
            <div style={{ background: 'var(--sky-light)', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>{registrandoPag.cidade}</div>
              <div style={{ color: 'var(--text-2)', marginTop: 2 }}>
                {registrandoPag.tipo === 'antecipacao' ? '40% — Antecipação salarial' : '60% — Folha de pagamento'} · {labelMesAno(mesAno)}
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)', marginTop: 6 }}>
                {fmt(registrandoPag.tipo === 'antecipacao'
                  ? (porCidade.find(g => g.cidade === registrandoPag.cidade)?.totalAntecipacao || 0)
                  : (porCidade.find(g => g.cidade === registrandoPag.cidade)?.totalFolha || 0)
                )}
              </div>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>Data do pagamento</label>
              <input type="text" value={dataPag} onChange={e => setDataPag(e.target.value)} placeholder="dd/mm/aaaa" style={{ ...inputStyle, width: '100%', fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setRegistrandoPag(null); setDataPag('') }} style={{ padding: '0.55rem 1.1rem', fontSize: 13, background: 'white', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={registrarPagamento} disabled={salvando || !dataPag} style={{ padding: '0.55rem 1.25rem', fontSize: 13, fontWeight: 700, background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', opacity: !dataPag ? 0.6 : 1 }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}

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
        porCidade.map(({ cidade, membros, totalAntecipacao, totalFolha, pagAntecipacao, pagFolha }) => {
          const aberta = cidadeExpandida === cidade
          const temValores = totalAntecipacao !== null || totalFolha !== null
          return (
            <div key={cidade} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>

              {/* Header cidade */}
              <div
                style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: 12, cursor: membros.length > 0 ? 'pointer' : 'default', transition: 'background 0.15s' }}
                onClick={() => membros.length > 0 && setCidadeExpandida(aberta ? null : cidade)}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{cidade}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{membros.length} colaborador{membros.length !== 1 ? 'es' : ''}</div>
                </div>

                {/* Antecipação */}
                <div style={{ textAlign: 'center', minWidth: 140 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Antecipação</div>
                  {totalAntecipacao !== null ? (
                    <>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>{fmt(totalAntecipacao)}</div>
                      {pagAntecipacao ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', marginTop: 2 }}>
                          <span style={{ fontSize: 10, background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: 10, padding: '1px 6px', fontWeight: 700 }}>✓ PAGO {pagAntecipacao.dataPagamento}</span>
                          <button onClick={e => { e.stopPropagation(); cancelarPagamento(pagAntecipacao.id) }} style={{ fontSize: 10, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                        </div>
                      ) : (
                        <button onClick={e => { e.stopPropagation(); setRegistrandoPag({ cidade, tipo: 'antecipacao' }); setDataPag('') }} style={{ marginTop: 3, padding: '2px 8px', fontSize: 10, fontWeight: 600, background: 'var(--sky-light)', color: 'var(--navy)', border: '1px solid var(--sky-mid)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Registrar pagamento
                        </button>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>—</div>
                  )}
                </div>

                <div style={{ width: 1, height: 40, background: 'var(--border)' }} />

                {/* Folha */}
                <div style={{ textAlign: 'center', minWidth: 140 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Folha</div>
                  {totalFolha !== null ? (
                    <>
                      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>{fmt(totalFolha)}</div>
                      {pagFolha ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', marginTop: 2 }}>
                          <span style={{ fontSize: 10, background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: 10, padding: '1px 6px', fontWeight: 700 }}>✓ PAGO {pagFolha.dataPagamento}</span>
                          <button onClick={e => { e.stopPropagation(); cancelarPagamento(pagFolha.id) }} style={{ fontSize: 10, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                        </div>
                      ) : (
                        <button onClick={e => { e.stopPropagation(); setRegistrandoPag({ cidade, tipo: 'folha' }); setDataPag('') }} style={{ marginTop: 3, padding: '2px 8px', fontSize: 10, fontWeight: 600, background: 'var(--sky-light)', color: 'var(--navy)', border: '1px solid var(--sky-mid)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Registrar pagamento
                        </button>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>—</div>
                  )}
                </div>

                {membros.length > 0 && (
                  <span style={{ color: 'var(--text-3)', fontSize: 12, marginLeft: 4 }}>{aberta ? '▲' : '▼'}</span>
                )}
              </div>

              {/* Detalhes expandidos — lista de colaboradores da cidade */}
              {aberta && membros.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  <table className="tabela tabela-sm">
                    <thead>
                      <tr>
                        <th>Colaborador</th>
                        <th style={{ textAlign: 'right' }}>Salário base</th>
                        <th>Banco / PIX</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {membros.map(c => (
                        <>
                          <tr key={c.id}>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{c.nome}</div>
                              {c.cpf && <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>{c.cpf}</div>}
                              {c.observacoes && <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 2 }}>📌 {c.observacoes}</div>}
                            </td>
                            <td style={{ textAlign: 'right' }}>{fmt(c.salarioBase)}</td>
                            <td style={{ fontSize: 12 }}>
                              {c.dadosBancarios?.banco && <div>{c.dadosBancarios.banco}</div>}
                              {c.dadosBancarios?.agencia && <div style={{ color: 'var(--text-3)' }}>Ag {c.dadosBancarios.agencia}{c.dadosBancarios.conta ? ` · C ${c.dadosBancarios.conta}` : ''}</div>}
                              {c.dadosBancarios?.pix && <div style={{ color: 'var(--text-3)' }}>PIX: {c.dadosBancarios.pix}</div>}
                              {!c.dadosBancarios?.banco && !c.dadosBancarios?.pix && <span style={{ color: 'var(--text-3)' }}>—</span>}
                            </td>
                            <td>
                              <button
                                onClick={() => setAdicionandoLanc(adicionandoLanc === c.id ? null : c.id)}
                                style={{ padding: '3px 8px', fontSize: 11, background: 'var(--sky-light)', color: 'var(--navy)', border: '1px solid var(--sky-mid)', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                              >+ Lançamento</button>
                            </td>
                          </tr>

                          {/* Lançamentos do colaborador */}
                          {lancamentos.filter(l => l.colaboradorId === c.id).map(l => (
                            <tr key={l.id} style={{ background: l.valor > 0 ? '#f0fdf4' : '#fef2f2' }}>
                              <td colSpan={2} style={{ paddingLeft: 28, fontSize: 12, color: 'var(--text-2)', fontStyle: 'italic' }}>
                                ↳ {l.descricao}{l.parcela ? ` (${l.parcela})` : ''}
                              </td>
                              <td style={{ fontSize: 12, fontWeight: 600, color: l.valor > 0 ? '#16a34a' : '#dc2626' }}>
                                {l.valor > 0 ? '+' : ''}{fmt(l.valor)}
                              </td>
                              <td>
                                <button onClick={() => removerLancamento(l.id)} style={{ padding: '2px 6px', fontSize: 10, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
                              </td>
                            </tr>
                          ))}

                          {/* Form novo lançamento */}
                          {adicionandoLanc === c.id && (
                            <tr style={{ background: '#fffbeb' }}>
                              <td colSpan={4} style={{ padding: '0.75rem 1rem' }}>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                  <div>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-2)', marginBottom: 3, textTransform: 'uppercase' as const }}>Tipo</div>
                                    <select value={novoLanc.tipo || ''} onChange={e => setNovoLanc(p => ({ ...p, tipo: e.target.value as TipoLancamento, colaboradorId: c.id }))} style={{ ...inputStyle, minWidth: 160 }}>
                                      <option value="">— Selecione —</option>
                                      {TIPOS_LANCAMENTO.map(t => <option key={t.value} value={t.value}>{t.sinal === 1 ? '+ ' : '− '}{t.label}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-2)', marginBottom: 3, textTransform: 'uppercase' as const }}>Descrição</div>
                                    <input value={novoLanc.descricao || ''} onChange={e => setNovoLanc(p => ({ ...p, descricao: e.target.value }))} placeholder="Descrição" style={{ ...inputStyle, minWidth: 180 }} />
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-2)', marginBottom: 3, textTransform: 'uppercase' as const }}>Valor (R$)</div>
                                    <input type="number" step="0.01" min="0" value={novoLanc.valor || ''} onChange={e => setNovoLanc(p => ({ ...p, valor: parseFloat(e.target.value) || 0 }))} placeholder="0,00" style={{ ...inputStyle, width: 100 }} />
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-2)', marginBottom: 3, textTransform: 'uppercase' as const }}>Parcela</div>
                                    <input value={novoLanc.parcela || ''} onChange={e => setNovoLanc(p => ({ ...p, parcela: e.target.value }))} placeholder="02 de 03" style={{ ...inputStyle, width: 110 }} />
                                  </div>
                                  <button onClick={salvarLancamento} disabled={salvando || !novoLanc.tipo || !novoLanc.valor} style={{ padding: '0.4rem 0.875rem', fontSize: 12, fontWeight: 700, background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', opacity: !novoLanc.tipo || !novoLanc.valor ? 0.5 : 1 }}>
                                    {salvando ? '...' : 'Salvar'}
                                  </button>
                                  <button onClick={() => { setAdicionandoLanc(null); setNovoLanc({}) }} style={{ padding: '0.4rem 0.75rem', fontSize: 12, background: 'white', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })
      )}

      {/* ── Totais gerais ── */}
      {(totalGeralAntecipacao || totalGeralFolha) && (
        <div style={{ background: 'var(--navy)', borderRadius: 12, padding: '1rem 1.5rem', display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600, flex: 1 }}>TOTAL GERAL — {labelMesAno(mesAno)}</div>
          {totalGeralAntecipacao && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Antecipação (dia 20)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>{fmt(totalGeralAntecipacao)}</div>
            </div>
          )}
          {totalGeralAntecipacao && totalGeralFolha && (
            <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.15)' }} />
          )}
          {totalGeralFolha && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Folha (dia 10)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>{fmt(totalGeralFolha)}</div>
            </div>
          )}
          {totalGeralAntecipacao && totalGeralFolha && (
            <>
              <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.15)' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Total mês</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#4AABDB' }}>{fmt(totalGeralAntecipacao + totalGeralFolha)}</div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
