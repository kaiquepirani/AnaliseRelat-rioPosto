'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
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

export default function ControlePagamentos() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [mesAno, setMesAno] = useState(mesAnoAtual())
  const [carregando, setCarregando] = useState(true)
  const [cidadeExpandida, setCidadeExpandida] = useState<Cidade | null>(null)
  const [adicionandoLanc, setAdicionandoLanc] = useState<string | null>(null) // colaboradorId
  const [novoLanc, setNovoLanc] = useState<Partial<Lancamento>>({})
  const [salvando, setSalvando] = useState(false)
  const [registrandoPag, setRegistrandoPag] = useState<{ cidade: Cidade; tipo: 'antecipacao' | 'folha' } | null>(null)
  const [dataPag, setDataPag] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    const [colabs, lancs, pags] = await Promise.all([
      fetch('/api/dp/colaboradores').then(r => r.json()),
      fetch(`/api/dp/lancamentos?mesAno=${mesAno}`).then(r => r.json()),
      fetch(`/api/dp/pagamentos?mesAno=${mesAno}`).then(r => r.json()),
    ])
    setColaboradores(colabs)
    setLancamentos(lancs)
    setPagamentos(pags)
    setCarregando(false)
  }, [mesAno])

  useEffect(() => { carregar() }, [carregar])

  // Calcula folha por colaborador
  const folhaPorColaborador = useMemo(() => {
    return colaboradores
      .filter(c => c.status === 'ativo')
      .map(c => {
        const lancsColab = lancamentos.filter(l => l.colaboradorId === c.id)
        const antecipacao = c.salarioBase * 0.4
        const extras = lancsColab.filter(l => !['antecipacao', 'salario'].includes(l.tipo)).reduce((s, l) => s + l.valor, 0)
        const totalBruto = c.salarioBase + extras
        const totalReceber = totalBruto - antecipacao
        return { colaborador: c, lancamentos: lancsColab, antecipacao, totalBruto, totalReceber, extras }
      })
  }, [colaboradores, lancamentos])

  // Agrupa por cidade
  const porCidade = useMemo(() => {
    return CIDADES_ORDEM.map(cidade => {
      const membros = folhaPorColaborador.filter(f => f.colaborador.cidade === cidade)
      const totalAntecipacao = membros.reduce((s, f) => s + f.antecipacao, 0)
      const totalFolha = membros.reduce((s, f) => s + f.totalReceber, 0)
      const pagAntecipacao = pagamentos.find(p => p.cidade === cidade && p.tipo === 'antecipacao')
      const pagFolha = pagamentos.find(p => p.cidade === cidade && p.tipo === 'folha')
      return { cidade, membros, totalAntecipacao, totalFolha, pagAntecipacao, pagFolha }
    }).filter(g => g.membros.length > 0)
  }, [folhaPorColaborador, pagamentos])

  const totalGeralAntecipacao = porCidade.reduce((s, c) => s + c.totalAntecipacao, 0)
  const totalGeralFolha = porCidade.reduce((s, c) => s + c.totalFolha, 0)
  const totalPagoAntecipacao = porCidade.filter(c => c.pagAntecipacao).reduce((s, c) => s + c.totalAntecipacao, 0)
  const totalPagoFolha = porCidade.filter(c => c.pagFolha).reduce((s, c) => s + c.totalFolha, 0)

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
    const valor = tipo === 'antecipacao' ? grupo.totalAntecipacao : grupo.totalFolha
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

  // Gera meses dos últimos 12 meses
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── Seletor de mês ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.875rem 1rem', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', boxShadow: 'var(--shadow-sm)' }}>
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Competência:</label>
        <select value={mesAno} onChange={e => setMesAno(e.target.value)} style={{ ...inputStyle, fontSize: 13, fontWeight: 600 }}>
          {mesesDisponiveis.map(ma => <option key={ma} value={ma}>{labelMesAno(ma)}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>
          Antecipação: dia 20/{mesAno.split('-')[1]} · Folha: dia 10/{String(parseInt(mesAno.split('-')[1]) % 12 + 1).padStart(2, '0')}
        </div>
      </div>

      {/* ── Cards resumo ── */}
      <div className="cards-grid">
        <div className="card">
          <div className="card-label">Antecipação total (40%)</div>
          <div className="card-valor" style={{ fontSize: 18 }}>{fmt(totalGeralAntecipacao)}</div>
          <div className="card-sub">dia 20 · {labelMesAno(mesAno)}</div>
        </div>
        <div className="card" style={{ borderColor: totalPagoAntecipacao >= totalGeralAntecipacao && totalGeralAntecipacao > 0 ? '#86efac' : '#fca5a5', background: totalPagoAntecipacao >= totalGeralAntecipacao && totalGeralAntecipacao > 0 ? '#f0fdf4' : undefined }}>
          <div className="card-label">Antecipações pagas</div>
          <div className="card-valor" style={{ fontSize: 18, color: totalPagoAntecipacao >= totalGeralAntecipacao && totalGeralAntecipacao > 0 ? '#16a34a' : 'var(--navy)' }}>{fmt(totalPagoAntecipacao)}</div>
          <div className="card-sub">{porCidade.filter(c => c.pagAntecipacao).length}/{porCidade.length} cidades</div>
        </div>
        <div className="card">
          <div className="card-label">Folha total (60% + aj.)</div>
          <div className="card-valor" style={{ fontSize: 18 }}>{fmt(totalGeralFolha)}</div>
          <div className="card-sub">dia 10 do mês seguinte</div>
        </div>
        <div className="card" style={{ borderColor: totalPagoFolha >= totalGeralFolha && totalGeralFolha > 0 ? '#86efac' : '#fca5a5', background: totalPagoFolha >= totalGeralFolha && totalGeralFolha > 0 ? '#f0fdf4' : undefined }}>
          <div className="card-label">Folhas pagas</div>
          <div className="card-valor" style={{ fontSize: 18, color: totalPagoFolha >= totalGeralFolha && totalGeralFolha > 0 ? '#16a34a' : 'var(--navy)' }}>{fmt(totalPagoFolha)}</div>
          <div className="card-sub">{porCidade.filter(c => c.pagFolha).length}/{porCidade.length} cidades</div>
        </div>
      </div>

      {/* ── Modal registrar pagamento ── */}
      {registrandoPag && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: 16, padding: '2rem', maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)', marginBottom: '1.25rem' }}>
              ✅ Registrar pagamento
            </div>
            <div style={{ background: 'var(--sky-light)', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>{registrandoPag.cidade}</div>
              <div style={{ color: 'var(--text-2)', marginTop: 2 }}>
                {registrandoPag.tipo === 'antecipacao' ? '40% — Antecipação salarial' : '60% — Folha de pagamento'} · {labelMesAno(mesAno)}
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)', marginTop: 6 }}>
                {fmt(registrandoPag.tipo === 'antecipacao'
                  ? porCidade.find(g => g.cidade === registrandoPag.cidade)?.totalAntecipacao || 0
                  : porCidade.find(g => g.cidade === registrandoPag.cidade)?.totalFolha || 0
                )}
              </div>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>Data do pagamento</label>
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
        <div className="estado-vazio">Calculando folha...</div>
      ) : porCidade.length === 0 ? (
        <div className="estado-vazio">
          <div className="estado-icone">📋</div>
          <div className="estado-titulo">Nenhum colaborador ativo</div>
          <div className="estado-desc">Cadastre colaboradores para visualizar a folha</div>
        </div>
      ) : (
        porCidade.map(({ cidade, membros, totalAntecipacao, totalFolha, pagAntecipacao, pagFolha }) => {
          const aberta = cidadeExpandida === cidade
          return (
            <div key={cidade} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>

              {/* Header cidade */}
              <div
                style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'background 0.15s' }}
                onClick={() => setCidadeExpandida(aberta ? null : cidade)}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{cidade}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{membros.length} colaborador{membros.length !== 1 ? 'es' : ''}</div>
                </div>

                {/* Antecipação */}
                <div style={{ textAlign: 'center', minWidth: 130 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Antecipação</div>
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
                </div>

                <div style={{ width: 1, height: 40, background: 'var(--border)' }} />

                {/* Folha */}
                <div style={{ textAlign: 'center', minWidth: 130 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Folha</div>
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
                </div>

                <span style={{ color: 'var(--text-3)', fontSize: 12, marginLeft: 4 }}>{aberta ? '▲' : '▼'}</span>
              </div>

              {/* Detalhes expandidos */}
              {aberta && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  <table className="tabela tabela-sm">
                    <thead>
                      <tr>
                        <th>Colaborador</th>
                        <th style={{ textAlign: 'right' }}>Salário base</th>
                        <th style={{ textAlign: 'right' }}>+ Extras / − Descontos</th>
                        <th style={{ textAlign: 'right' }}>Antecipação (40%)</th>
                        <th style={{ textAlign: 'right' }}>A receber</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {membros.map(({ colaborador: c, lancamentos: lancs, antecipacao, totalBruto, totalReceber, extras }) => (
                        <>
                          <tr key={c.id}>
                            <td>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{c.nome}</div>
                              {c.observacoes && <div style={{ fontSize: 11, color: 'var(--amber)' }}>📌 {c.observacoes}</div>}
                            </td>
                            <td style={{ textAlign: 'right' }}>{fmt(c.salarioBase)}</td>
                            <td style={{ textAlign: 'right', color: extras >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                              {extras !== 0 ? (extras > 0 ? '+' : '') + fmt(extras) : '—'}
                            </td>
                            <td style={{ textAlign: 'right', color: '#dc2626' }}>−{fmt(antecipacao)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--navy)' }}>{fmt(totalReceber)}</td>
                            <td>
                              <button
                                onClick={() => { setAdicionandoLanc(adicionandoLanc === c.id ? null : c.id); setNovoLanc({ colaboradorId: c.id }) }}
                                style={{ padding: '3px 8px', fontSize: 11, background: 'var(--sky-light)', color: 'var(--navy)', border: '1px solid var(--sky-mid)', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                              >+ Lançamento</button>
                            </td>
                          </tr>

                          {/* Lançamentos do colaborador */}
                          {lancs.filter(l => !['antecipacao', 'salario'].includes(l.tipo)).map(l => (
                            <tr key={l.id} style={{ background: l.valor > 0 ? '#f0fdf4' : '#fef2f2' }}>
                              <td colSpan={2} style={{ paddingLeft: 28, fontSize: 12, color: 'var(--text-2)', fontStyle: 'italic' }}>
                                ↳ {l.descricao}{l.parcela ? ` (${l.parcela})` : ''}
                              </td>
                              <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, color: l.valor > 0 ? '#16a34a' : '#dc2626' }}>
                                {l.valor > 0 ? '+' : ''}{fmt(l.valor)}
                              </td>
                              <td colSpan={2} />
                              <td>
                                <button onClick={() => removerLancamento(l.id)} style={{ padding: '2px 6px', fontSize: 10, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
                              </td>
                            </tr>
                          ))}

                          {/* Form novo lançamento */}
                          {adicionandoLanc === c.id && (
                            <tr style={{ background: '#fffbeb' }}>
                              <td colSpan={6} style={{ padding: '0.75rem 1rem' }}>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                  <div>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-2)', marginBottom: 3, textTransform: 'uppercase' }}>Tipo</div>
                                    <select value={novoLanc.tipo || ''} onChange={e => setNovoLanc(p => ({ ...p, tipo: e.target.value as TipoLancamento }))} style={{ ...inputStyle, minWidth: 160 }}>
                                      <option value="">— Selecione —</option>
                                      {TIPOS_LANCAMENTO.map(t => <option key={t.value} value={t.value}>{t.sinal === 1 ? '+ ' : '− '}{t.label}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-2)', marginBottom: 3, textTransform: 'uppercase' }}>Descrição</div>
                                    <input value={novoLanc.descricao || ''} onChange={e => setNovoLanc(p => ({ ...p, descricao: e.target.value }))} placeholder="Descrição" style={{ ...inputStyle, minWidth: 180 }} />
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-2)', marginBottom: 3, textTransform: 'uppercase' }}>Valor (R$)</div>
                                    <input type="number" step="0.01" min="0" value={novoLanc.valor || ''} onChange={e => setNovoLanc(p => ({ ...p, valor: parseFloat(e.target.value) || 0 }))} placeholder="0,00" style={{ ...inputStyle, width: 100 }} />
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-2)', marginBottom: 3, textTransform: 'uppercase' }}>Parcela</div>
                                    <input value={novoLanc.parcela || ''} onChange={e => setNovoLanc(p => ({ ...p, parcela: e.target.value }))} placeholder="ex: 02 de 03" style={{ ...inputStyle, width: 110 }} />
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
                    <tfoot>
                      <tr style={{ background: 'var(--sky-light)' }}>
                        <td style={{ fontWeight: 700 }}>TOTAL {cidade.toUpperCase()}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(membros.reduce((s, f) => s + f.colaborador.salarioBase, 0))}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(membros.reduce((s, f) => s + f.extras, 0))}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>−{fmt(totalAntecipacao)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--navy)' }}>{fmt(totalFolha)}</td>
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

      {/* ── Totais gerais ── */}
      {porCidade.length > 0 && (
        <div style={{ background: 'var(--navy)', borderRadius: 12, padding: '1rem 1.5rem', display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 600, flex: 1 }}>TOTAL GERAL — {labelMesAno(mesAno)}</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Antecipação</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>{fmt(totalGeralAntecipacao)}</div>
          </div>
          <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.15)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Folha</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>{fmt(totalGeralFolha)}</div>
          </div>
          <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.15)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total mês</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#4AABDB' }}>{fmt(totalGeralAntecipacao + totalGeralFolha)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
