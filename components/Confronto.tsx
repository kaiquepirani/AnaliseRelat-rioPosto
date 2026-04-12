'use client'
import { useState, useCallback, useRef } from 'react'
import { FROTA, normalizarPlaca } from '@/lib/frota'
import { Extrato } from '@/lib/types'
import * as XLSX from 'xlsx'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function prefixoParaPlaca(prefixo: string | number): string | null {
  const prefStr = String(prefixo).trim().split('/')[0].trim()
  const v = FROTA.find(x => x.nFrota === prefStr)
  return v ? normalizarPlaca(v.placa) : null
}

function parsarDataExcel(val: any): Date | null {
  if (!val) return null
  if (val instanceof Date) return val
  if (typeof val === 'number') {
    const d = new Date((val - 25569) * 86400 * 1000)
    return isNaN(d.getTime()) ? null : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  }
  const s = String(val)
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(+m[1], +m[2]-1, +m[3])
  const m2 = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m2) { let a=+m2[3]; if(a<100) a+=a<50?2000:1900; return new Date(a,+m2[2]-1,+m2[1]) }
  return null
}

function parsarDataPosto(s: string): Date | null {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return new Date(+m[3], +m[2]-1, +m[1])
  return null
}

function fmtData(d: Date) {
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}

function diffDias(a: Date, b: Date): number {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / 86400000))
}

interface Viagem {
  n: number; setor: string; data: Date; destino: string
  prefixo: string; placa: string | null; combus: number; motorista: string
}

interface Abastecimento {
  data: Date; cupom: string; placa: string; valor: number
}

interface Resultado {
  abastecimento: Abastecimento
  status: 'ok' | 'sem_viagem' | 'valor_divergente'
  viagem?: Viagem
  diffValor?: number
  diffDias?: number
  observacao: string
}

export default function Confronto({ extratos }: { extratos: Extrato[] }) {
  const [fonteExtrato, setFonteExtrato] = useState<'pdf' | 'sistema'>('sistema')
  const [planilhaArq, setPlanilhaArq] = useState<File | null>(null)
  const [pdfArqs, setPdfArqs] = useState<File[]>([])
  const [extratosSel, setExtratosSel] = useState<string[]>([])
  const [processando, setProcessando] = useState(false)
  const [resultados, setResultados] = useState<Resultado[] | null>(null)
  const [erro, setErro] = useState('')
  const [tolerancia, setTolerancia] = useState(1)
  const [toleranciaValor, setToleraciaValor] = useState(10)
  const planilhaRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)

  const toggleExtrato = (id: string) => {
    setExtratosSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const parsarPlanilha = async (file: File): Promise<Viagem[]> => {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const ws = wb.Sheets['RELATORIO'] || wb.Sheets[wb.SheetNames[0]]
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

    let headerRow = -1
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
      const r = rows[i].map(v => String(v||'').toUpperCase())
      if (r.some(v => v.includes('CARRO') || v.includes('PREFIX'))) { headerRow = i; break }
    }
    if (headerRow === -1) throw new Error('Não encontrei o cabeçalho na planilha')

    const headers = rows[headerRow].map(v => String(v||'').toUpperCase())
    const idx = {
      n:         headers.findIndex(h => h === 'N' || h === 'Nº' || h === 'N°'),
      setor:     headers.findIndex(h => h.includes('SETOR')),
      data:      headers.findIndex(h => h === 'DATA'),
      destino:   headers.findIndex(h => h.includes('DESTINO')),
      prefixo:   headers.findIndex(h => h.includes('CARRO') || h.includes('PREFIX')),
      combus:    headers.findIndex(h => h.includes('COMBUS') && !h.includes('LITRO')),
      motorista: headers.findIndex(h => h.includes('MOTOR')),
    }

    const viagens: Viagem[] = []
    for (let i = headerRow + 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || !row[idx.data]) continue
      const data = parsarDataExcel(row[idx.data])
      if (!data) continue
      const prefixo = String(row[idx.prefixo] || '').trim()
      if (!prefixo || prefixo === 'null') continue
      const combus = parseFloat(String(row[idx.combus] || '0').replace(',', '.')) || 0
      if (combus <= 0) continue
      viagens.push({
        n: parseInt(String(row[idx.n] || '0')) || i,
        setor: String(row[idx.setor] || ''),
        data,
        destino: String(row[idx.destino] || ''),
        prefixo: prefixo.split('/')[0].trim(),
        placa: prefixoParaPlaca(prefixo),
        combus,
        motorista: String(row[idx.motorista] || ''),
      })
    }
    return viagens
  }

  const parsarPDF = async (file: File): Promise<Abastecimento[]> => {
    const buf = await file.arrayBuffer()
    const base64 = btoa(Array.from(new Uint8Array(buf)).map(b => String.fromCharCode(b)).join(''))
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: `Extraia todos os abastecimentos deste extrato e retorne APENAS JSON sem markdown.
Formato: {"abastecimentos": [{"data": "DD/MM/AAAA", "cupom": "000000", "placa": "ABC1234", "valor": 123.45}]}
Regras: data DD/MM/AAAA, placa sem hífen, valor número decimal com ponto, extraia TODOS os registros.` }
          ]
        }]
      })
    })
    const data = await res.json()
    const texto = data.content?.[0]?.text || ''
    const parsed = JSON.parse(texto.replace(/```json|```/g, '').trim())
    return (parsed.abastecimentos || []).map((a: any) => ({
      data: parsarDataPosto(a.data) || new Date(),
      cupom: String(a.cupom || ''),
      placa: normalizarPlaca(String(a.placa || '')),
      valor: parseFloat(String(a.valor).replace(',', '.')) || 0,
    })).filter((a: Abastecimento) => a.valor > 0)
  }

  const extrairDoSistema = (ids: string[]): Abastecimento[] => {
    return ids.flatMap(id => {
      const extrato = extratos.find(e => e.id === id)
      if (!extrato) return []
      return extrato.postos.flatMap(p =>
        p.lancamentos.map(l => ({
          data: parsarDataPosto(l.emissao) || new Date(),
          cupom: l.documento,
          placa: normalizarPlaca(l.placaLida),
          valor: l.valor,
        }))
      )
    }).filter(a => a.valor > 0)
  }

  const confrontar = async () => {
    if (!planilhaArq) return
    if (fonteExtrato === 'pdf' && pdfArqs.length === 0) return
    if (fonteExtrato === 'sistema' && extratosSel.length === 0) return
    setProcessando(true)
    setErro('')
    setResultados(null)
    try {
      const viagens = await parsarPlanilha(planilhaArq)
      let abastecimentos: Abastecimento[]
      if (fonteExtrato === 'pdf') {
        const resultsPDF = await Promise.all(pdfArqs.map(f => parsarPDF(f)))
        abastecimentos = resultsPDF.flat()
      } else {
        abastecimentos = extrairDoSistema(extratosSel)
      }

      const resultados: Resultado[] = []
      for (const ab of abastecimentos) {
        const candidatas = viagens.filter(v => v.placa && v.placa === ab.placa && diffDias(v.data, ab.data) <= tolerancia)
        if (candidatas.length === 0) {
          resultados.push({ abastecimento: ab, status: 'sem_viagem', observacao: `Nenhuma viagem para ${ab.placa} em ${fmtData(ab.data)} (±${tolerancia}d)` })
          continue
        }
        const melhor = candidatas.reduce((a, b) => Math.abs(a.combus - ab.valor) < Math.abs(b.combus - ab.valor) ? a : b)
        const diffPct = (Math.abs(melhor.combus - ab.valor) / ab.valor) * 100
        if (diffPct > toleranciaValor) {
          resultados.push({ abastecimento: ab, status: 'valor_divergente', viagem: melhor, diffValor: melhor.combus - ab.valor, diffDias: diffDias(melhor.data, ab.data), observacao: `Valor diverge ${diffPct.toFixed(1)}%` })
        } else {
          resultados.push({ abastecimento: ab, status: 'ok', viagem: melhor, diffValor: melhor.combus - ab.valor, diffDias: diffDias(melhor.data, ab.data), observacao: 'Confirmado' })
        }
      }
      setResultados(resultados.sort((a, b) => ({ sem_viagem: 0, valor_divergente: 1, ok: 2 }[a.status] - { sem_viagem: 0, valor_divergente: 1, ok: 2 }[b.status])))
    } catch (e: any) {
      setErro(e.message || 'Erro ao processar')
    } finally {
      setProcessando(false)
    }
  }

  const semViagem = resultados?.filter(r => r.status === 'sem_viagem') || []
  const divergentes = resultados?.filter(r => r.status === 'valor_divergente') || []
  const confirmados = resultados?.filter(r => r.status === 'ok') || []

  const totalAbastPDF = pdfArqs.reduce((s, f) => s + (f.size > 0 ? 1 : 0), 0)
  const totalLancSistema = extratosSel.reduce((s, id) => {
    const e = extratos.find(x => x.id === id)
    return s + (e ? e.postos.flatMap(p => p.lancamentos).length : 0)
  }, 0)
  const prontoParaConfrontar = planilhaArq && (fonteExtrato === 'pdf' ? pdfArqs.length > 0 : extratosSel.length > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
        <div className="grafico-titulo">Confronto: Extrato do Posto × Planilha de Viagens</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: '1.5rem' }}>
          Cruza os abastecimentos do posto com sua planilha de viagens e identifica abastecimentos sem viagem correspondente.
        </div>

        {/* Seletor de fonte do extrato */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div className="filtro-label" style={{ marginBottom: 8 }}>Fonte do extrato do posto</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['sistema', 'pdf'] as const).map(op => (
              <button key={op} onClick={() => { setFonteExtrato(op); setPdfArqs([]); setExtratosSel([]) }}
                style={{
                  padding: '0.5rem 1.1rem', fontSize: 13, fontWeight: 600, borderRadius: 8,
                  border: `2px solid ${fonteExtrato === op ? 'var(--navy)' : 'var(--border)'}`,
                  background: fonteExtrato === op ? 'var(--sky-light)' : 'var(--bg)',
                  color: fonteExtrato === op ? 'var(--navy)' : 'var(--text-2)',
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                }}>
                {op === 'sistema' ? '📂 Usar extrato já lançado no site' : '📄 Enviar novo PDF do posto'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          {/* Planilha de viagens - sempre obrigatório */}
          <div onClick={() => planilhaRef.current?.click()} style={{
            border: `2px dashed ${planilhaArq ? 'var(--sky)' : 'var(--border)'}`,
            borderRadius: 'var(--radius)', padding: '1.25rem', cursor: 'pointer',
            textAlign: 'center', background: planilhaArq ? 'var(--sky-light)' : 'var(--bg)', transition: 'all 0.15s',
          }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>📊</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)' }}>Planilha de Viagens (.xlsx)</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              {planilhaArq ? `✓ ${planilhaArq.name}` : 'Clique para selecionar'}
            </div>
            <input ref={planilhaRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
              onChange={e => setPlanilhaArq(e.target.files?.[0] || null)} />
          </div>

          {/* Extrato - PDF ou sistema */}
          {fonteExtrato === 'pdf' ? (
            <div style={{
              border: `2px dashed ${pdfArqs.length > 0 ? 'var(--sky)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)', padding: '1.25rem',
              background: pdfArqs.length > 0 ? 'var(--sky-light)' : 'var(--bg)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>📄 Extratos do Posto (PDF)</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 10 }}>Selecione um ou mais PDFs para juntar quinzenas</div>
              <button onClick={() => pdfRef.current?.click()}
                style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10 }}>
                + Adicionar PDF
              </button>
              <input ref={pdfRef} type="file" accept=".pdf" multiple style={{ display: 'none' }}
                onChange={e => {
                  const novos = Array.from(e.target.files || [])
                  setPdfArqs(prev => [...prev, ...novos])
                  e.target.value = ''
                }} />
              {pdfArqs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {pdfArqs.map((f, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'white', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 12 }}>
                      <span style={{ color: 'var(--navy)', fontWeight: 500 }}>✓ {f.name}</span>
                      <button onClick={() => setPdfArqs(prev => prev.filter((_, j) => j !== i))}
                        style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 14, fontWeight: 700, padding: '0 4px' }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{
              border: `2px solid ${extratosSel.length > 0 ? 'var(--sky)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)', padding: '1.25rem',
              background: extratosSel.length > 0 ? 'var(--sky-light)' : 'var(--bg)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy)', marginBottom: 6 }}>📂 Extratos já lançados</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 10 }}>Selecione um ou mais para juntar quinzenas</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {extratos.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>Nenhum extrato lançado ainda.</div>
                ) : extratos.map(e => {
                  const sel = extratosSel.includes(e.id)
                  return (
                    <label key={e.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                      background: sel ? 'white' : 'var(--bg)', border: `1px solid ${sel ? 'var(--sky)' : 'var(--border)'}`,
                      borderRadius: 8, padding: '8px 12px', transition: 'all 0.15s',
                    }}>
                      <input type="checkbox" checked={sel} onChange={() => toggleExtrato(e.id)}
                        style={{ width: 15, height: 15, accentColor: 'var(--navy)', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)' }}>{e.postos[0]?.nome}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
                          {e.periodo || e.arquivo} · {e.postos.flatMap(p => p.lancamentos).length} lançamentos · {e.totalValor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
              {extratosSel.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--navy)', fontWeight: 600 }}>
                  ✓ {extratosSel.length} extrato{extratosSel.length > 1 ? 's' : ''} selecionado{extratosSel.length > 1 ? 's' : ''} · {totalLancSistema} lançamentos no total
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tolerâncias e botão */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="filtro-grupo">
            <label className="filtro-label">Tolerância de data</label>
            <select className="filtro-select-lg" style={{ minWidth: 160 }} value={tolerancia} onChange={e => setTolerancia(+e.target.value)}>
              <option value={0}>Mesmo dia exato</option>
              <option value={1}>±1 dia</option>
              <option value={2}>±2 dias</option>
              <option value={3}>±3 dias</option>
            </select>
          </div>
          <div className="filtro-grupo">
            <label className="filtro-label">Tolerância de valor</label>
            <select className="filtro-select-lg" style={{ minWidth: 160 }} value={toleranciaValor} onChange={e => setToleraciaValor(+e.target.value)}>
              <option value={5}>Até 5% de diferença</option>
              <option value={10}>Até 10% de diferença</option>
              <option value={15}>Até 15% de diferença</option>
              <option value={20}>Até 20% de diferença</option>
            </select>
          </div>
          <button onClick={confrontar} disabled={!prontoParaConfrontar || processando}
            style={{
              padding: '0.6rem 1.5rem', fontWeight: 700, fontSize: 14,
              background: (!prontoParaConfrontar || processando) ? 'var(--border)' : 'var(--navy)',
              color: 'white', border: 'none', borderRadius: 'var(--radius-sm)',
              cursor: (!prontoParaConfrontar || processando) ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'all 0.15s', alignSelf: 'flex-end',
            }}>
            {processando ? <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="spinner" />Analisando...</span> : 'Confrontar'}
          </button>
        </div>

        {erro && (
          <div style={{ marginTop: '1rem', background: 'var(--red-bg)', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.75rem 1rem', fontSize: 13, color: 'var(--red)' }}>
            {erro}
          </div>
        )}
      </div>

      {resultados && (
        <>
          <div className="cards-grid">
            <div className="card"><div className="card-label">Total analisado</div><div className="card-valor">{resultados.length}</div><div className="card-sub">{fmt(resultados.reduce((s,r)=>s+r.abastecimento.valor,0))}</div></div>
            <div className={`card ${semViagem.length > 0 ? 'card-alerta' : 'card-ok'}`}><div className="card-label">Sem viagem correspondente</div><div className="card-valor">{semViagem.length}</div><div className="card-sub">{fmt(semViagem.reduce((s,r)=>s+r.abastecimento.valor,0))}</div></div>
            <div className={`card ${divergentes.length > 0 ? 'card-alerta' : 'card-ok'}`}><div className="card-label">Valor divergente</div><div className="card-valor">{divergentes.length}</div><div className="card-sub">{fmt(divergentes.reduce((s,r)=>s+r.abastecimento.valor,0))}</div></div>
            <div className="card card-ok"><div className="card-label">Confirmados</div><div className="card-valor">{confirmados.length}</div><div className="card-sub">{fmt(confirmados.reduce((s,r)=>s+r.abastecimento.valor,0))}</div></div>
          </div>

          {semViagem.length > 0 && (
            <div className="alerta-secao">
              <div className="alerta-header alerta-vermelho">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Sem viagem correspondente — {semViagem.length} abastecimentos · {fmt(semViagem.reduce((s,r)=>s+r.abastecimento.valor,0))}
              </div>
              <table className="tabela tabela-sm">
                <thead><tr><th>Data</th><th>Placa</th><th>Grupo</th><th>Cupom</th><th>Valor posto</th><th>Observação</th></tr></thead>
                <tbody>
                  {semViagem.map((r, i) => {
                    const veiculo = FROTA.find(v => normalizarPlaca(v.placa) === r.abastecimento.placa)
                    return (
                      <tr key={i} className="tr-vermelho">
                        <td>{fmtData(r.abastecimento.data)}</td>
                        <td><code>{r.abastecimento.placa}</code>{veiculo && <div style={{fontSize:11,color:'var(--text-3)'}}>Prefixo {veiculo.nFrota}</div>}</td>
                        <td style={{fontSize:12}}>{veiculo?.grupo||'—'}</td>
                        <td style={{fontSize:12}}>{r.abastecimento.cupom}</td>
                        <td style={{fontWeight:600}}>{fmt(r.abastecimento.valor)}</td>
                        <td style={{fontSize:12,color:'var(--red)'}}>{r.observacao}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {divergentes.length > 0 && (
            <div className="alerta-secao">
              <div className="alerta-header alerta-amarelo">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Valor divergente — {divergentes.length} ocorrências
              </div>
              <table className="tabela tabela-sm">
                <thead><tr><th>Data</th><th>Placa</th><th>Destino da viagem</th><th>Valor posto</th><th>Valor planilha</th><th>Diferença</th><th>Dias</th></tr></thead>
                <tbody>
                  {divergentes.map((r, i) => {
                    const diff = r.diffValor || 0
                    const diffPct = (Math.abs(diff)/r.abastecimento.valor*100).toFixed(1)
                    return (
                      <tr key={i} className="tr-amarelo">
                        <td>{fmtData(r.abastecimento.data)}</td>
                        <td><code>{r.abastecimento.placa}</code></td>
                        <td style={{fontSize:12}}>{r.viagem?.destino||'—'}</td>
                        <td style={{fontWeight:600}}>{fmt(r.abastecimento.valor)}</td>
                        <td>{fmt(r.viagem?.combus||0)}</td>
                        <td><span className={`badge-diff ${diff<0?'badge-vermelho':'badge-neutro'}`}>{diff>0?'+':''}{fmt(diff)} ({diffPct}%)</span></td>
                        <td>{r.diffDias}d</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {confirmados.length > 0 && (
            <div className="alerta-secao">
              <div className="alerta-header" style={{background:'var(--green-bg)',color:'var(--green)',borderBottom:'1px solid #86efac'}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                Confirmados — {confirmados.length} abastecimentos · {fmt(confirmados.reduce((s,r)=>s+r.abastecimento.valor,0))}
              </div>
              <table className="tabela tabela-sm">
                <thead><tr><th>Data</th><th>Placa</th><th>Destino</th><th>Valor posto</th><th>Valor planilha</th><th>Diferença</th><th>Motorista</th></tr></thead>
                <tbody>
                  {confirmados.map((r, i) => {
                    const diff = r.diffValor||0
                    return (
                      <tr key={i}>
                        <td>{fmtData(r.abastecimento.data)}</td>
                        <td><code>{r.abastecimento.placa}</code></td>
                        <td style={{fontSize:12}}>{r.viagem?.destino||'—'}</td>
                        <td>{fmt(r.abastecimento.valor)}</td>
                        <td>{fmt(r.viagem?.combus||0)}</td>
                        <td><span className={`badge-diff ${Math.abs(diff)<1?'badge-verde':'badge-neutro'}`}>{diff>0?'+':''}{fmt(diff)}</span></td>
                        <td style={{fontSize:12}}>{r.viagem?.motorista||'—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
