'use client'
import { useState, useMemo, useEffect } from 'react'
import { Extrato } from '@/lib/types'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtL = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' L'

type Frequencia = 'semanal' | 'quinzenal' | 'mensal' | 'esporadico'

interface PostoEsperado {
  id: string
  nome: string
  chave: string
  frequencia: Frequencia
}

const POSTOS_PADRAO: PostoEsperado[] = [
  { id: '1',  nome: 'Auto Posto Skina Italianos',        chave: 'SKINA ITALIANOS',               frequencia: 'semanal'    },
  { id: '2',  nome: 'Posto Tiago Águas de Lindóia',      chave: 'POSTO TIAGO',                   frequencia: 'semanal'    },
  { id: '3',  nome: 'Auto Posto Praia de São Francisco', chave: 'PRAIA DE SAO FRANCISCO',        frequencia: 'quinzenal'  },
  { id: '4',  nome: 'Cooperativa dos Cafeicultores',     chave: 'COOPERATIVA DOS CAFEICULTORES', frequencia: 'quinzenal'  },
  { id: '5',  nome: 'Mocafor Mococa',                    chave: 'MOCAFOR',                       frequencia: 'quinzenal'  },
  { id: '6',  nome: 'Irmãos Miguel Morungaba',           chave: 'IRMAOS MIGUEL',                 frequencia: 'quinzenal'  },
  { id: '7',  nome: 'Itapirense Escolar',                chave: 'ITAPIRENSE',                    frequencia: 'quinzenal'  },
  { id: '8',  nome: 'Posto JL Aguaí',                   chave: 'JL AGUAI',                      frequencia: 'quinzenal'  },
  { id: '9',  nome: 'Posto Abastece Rio Claro',          chave: 'ABASTECE RIO CLARO',            frequencia: 'quinzenal'  },
  { id: '10', nome: 'Posto RVM Mogi Mirim',              chave: 'RVM MOGI',                      frequencia: 'quinzenal'  },
  { id: '11', nome: 'Auto Posto São Benedito',           chave: 'SAO BENEDITO',                  frequencia: 'mensal'     },
  { id: '12', nome: 'Tanque Águas (Interno)',            chave: 'TANQUE AGUAS',                  frequencia: 'esporadico' },
]

const FREQUENCIA_LABEL: Record<Frequencia, string> = {
  semanal:    'Semanal (~4/mês)',
  quinzenal:  'Quinzenal (2/mês)',
  mensal:     'Mensal (1/mês)',
  esporadico: 'Esporádico',
}

const ESPERADO_MES: Record<Frequencia, number> = {
  semanal:    4,
  quinzenal:  2,
  mensal:     1,
  esporadico: 0,
}

function nomeMes(mes: number): string {
  return ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
          'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mes]
}

function parsarDataBR(s: string): Date | null {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return null
  let ano = parseInt(m[3])
  if (ano < 100) ano += ano < 50 ? 2000 : 1900
  return new Date(ano, parseInt(m[2]) - 1, parseInt(m[1]))
}

// Verifica se o período do extrato cobre o mês/ano selecionado
// Um extrato cobre o mês se: dataFim >= primeiro dia do mês E dataInicio <= último dia do mês
function extratoCobreMes(periodo: string, mes: number, ano: number): boolean {
  const partes = periodo.split(' a ')
  const dataInicio = parsarDataBR(partes[0]?.trim() || '')
  const dataFim = parsarDataBR(partes[1]?.trim() || '')
  if (!dataInicio || !dataFim) return false

  const primeiroDiaMes = new Date(ano, mes, 1)
  const ultimoDiaMes = new Date(ano, mes + 1, 0) // último dia do mês

  return dataInicio <= ultimoDiaMes && dataFim >= primeiroDiaMes
}

function matchPosto(nomeExtrato: string, chave: string): boolean {
  const n = nomeExtrato.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const c = chave.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return n.includes(c)
}

export default function ControleExtratos({ extratos }: { extratos: Extrato[] }) {
  const hoje = new Date()
  const [mesSel, setMesSel] = useState(hoje.getMonth())
  const [anoSel, setAnoSel] = useState(hoje.getFullYear())
  const [postos, setPostos] = useState<PostoEsperado[]>(POSTOS_PADRAO)
  const [editandoPostos, setEditandoPostos] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novaChave, setNovaChave] = useState('')
  const [novaFreq, setNovaFreq] = useState<Frequencia>('quinzenal')
  const [adicionando, setAdicionando] = useState(false)

  useEffect(() => {
    try {
      const salvo = localStorage.getItem('controle_postos')
      if (salvo) setPostos(JSON.parse(salvo))
    } catch {}
  }, [])

  const salvarPostos = (lista: PostoEsperado[]) => {
    setPostos(lista)
    try { localStorage.setItem('controle_postos', JSON.stringify(lista)) } catch {}
  }

  // Extratos que cobrem o mês selecionado (início OU fim dentro do mês)
  const extratosMes = useMemo(() => {
    return extratos.filter(e => extratoCobreMes(e.periodo, mesSel, anoSel))
  }, [extratos, mesSel, anoSel])

  const statusPostos = useMemo(() => {
    return postos.map(posto => {
      const extratosDoPost = extratosMes.filter(e =>
        e.postos.some(p => matchPosto(p.nome, posto.chave))
      )

      const totalValor = extratosDoPost.reduce((s, e) =>
        s + e.postos
          .filter(p => matchPosto(p.nome, posto.chave))
          .reduce((ss, p) => ss + p.totalValor, 0), 0)

      const totalLitros = extratosDoPost.reduce((s, e) =>
        s + e.postos
          .filter(p => matchPosto(p.nome, posto.chave))
          .reduce((ss, p) => ss + p.totalLitros, 0), 0)

      const esperado = ESPERADO_MES[posto.frequencia]
      const recebido = extratosDoPost.length

      let status: 'ok' | 'parcial' | 'faltando' | 'esporadico'
      if (posto.frequencia === 'esporadico') {
        status = 'esporadico'
      } else if (recebido === 0) {
        status = 'faltando'
      } else if (recebido >= esperado) {
        status = 'ok'
      } else {
        status = 'parcial'
      }

      const periodos = extratosDoPost.map(e => e.periodo)

      return { posto, extratosDoPost, totalValor, totalLitros, esperado, recebido, status, periodos }
    })
  }, [postos, extratosMes])

  const totalOk = statusPostos.filter(s => s.status === 'ok').length
  const totalParcial = statusPostos.filter(s => s.status === 'parcial').length
  const totalFaltando = statusPostos.filter(s => s.status === 'faltando').length
  const totalValorMes = statusPostos.reduce((s, p) => s + p.totalValor, 0)

  const removerPosto = (id: string) => salvarPostos(postos.filter(p => p.id !== id))

  const alterarFrequencia = (id: string, freq: Frequencia) => {
    salvarPostos(postos.map(p => p.id === id ? { ...p, frequencia: freq } : p))
  }

  const adicionarPosto = () => {
    if (!novoNome.trim() || !novaChave.trim()) return
    const novo: PostoEsperado = {
      id: Date.now().toString(),
      nome: novoNome.trim(),
      chave: novaChave.trim().toUpperCase(),
      frequencia: novaFreq,
    }
    salvarPostos([...postos, novo])
    setNovoNome('')
    setNovaChave('')
    setNovaFreq('quinzenal')
    setAdicionando(false)
  }

  const anos = useMemo(() => {
    const set = new Set<number>()
    set.add(hoje.getFullYear())
    extratos.forEach(e => {
      const d = parsarDataBR(e.periodo.split(' a ')[0])
      if (d) set.add(d.getFullYear())
    })
    return Array.from(set).sort((a, b) => b - a)
  }, [extratos])

  const statusColor = (s: string) => {
    if (s === 'ok')        return { bg: '#f0fdf4', border: '#86efac', color: '#16a34a', icon: '✅' }
    if (s === 'parcial')   return { bg: '#fffbeb', border: '#fcd34d', color: '#d97706', icon: '⚠️' }
    if (s === 'faltando')  return { bg: '#fef2f2', border: '#fca5a5', color: '#dc2626', icon: '❌' }
    return                        { bg: '#f8fafc', border: '#e2e8f0', color: '#64748b', icon: '📋' }
  }

  return (
    <div className="analise-veiculo">

      {/* ── Seletor de mês ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div className="filtro-grupo">
          <label className="filtro-label">Mês</label>
          <select className="filtro-select-lg" value={mesSel} onChange={e => setMesSel(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i}>{nomeMes(i)}</option>
            ))}
          </select>
        </div>
        <div className="filtro-grupo">
          <label className="filtro-label">Ano</label>
          <select className="filtro-select-lg" value={anoSel} onChange={e => setAnoSel(Number(e.target.value))}>
            {anos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => setEditandoPostos(v => !v)}
            style={{
              padding: '0.45rem 1rem', fontSize: 12, fontWeight: 600,
              background: editandoPostos ? 'var(--navy)' : 'white',
              color: editandoPostos ? 'white' : 'var(--navy)',
              border: '1px solid var(--navy)', borderRadius: 8,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >⚙️ {editandoPostos ? 'Fechar configuração' : 'Configurar postos'}</button>
        </div>
      </div>

      {/* ── Cards resumo ── */}
      <div className="cards-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="card card-ok">
          <div className="card-label">Completos</div>
          <div className="card-valor" style={{ color: '#16a34a' }}>{totalOk}</div>
          <div className="card-sub">postos em dia</div>
        </div>
        <div className="card" style={{ borderColor: '#fcd34d' }}>
          <div className="card-label">Parciais</div>
          <div className="card-valor" style={{ color: '#d97706' }}>{totalParcial}</div>
          <div className="card-sub">aguardando mais extratos</div>
        </div>
        <div className="card card-alerta">
          <div className="card-label">Faltando</div>
          <div className="card-valor" style={{ color: '#dc2626' }}>{totalFaltando}</div>
          <div className="card-sub">nenhum extrato recebido</div>
        </div>
        <div className="card">
          <div className="card-label">Total recebido em {nomeMes(mesSel)}</div>
          <div className="card-valor">{fmt(totalValorMes)}</div>
        </div>
      </div>

      {/* ── Configuração de postos ── */}
      {editandoPostos && (
        <div style={{
          background: '#f8fafc', border: '1px solid var(--border)',
          borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem',
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)', marginBottom: '1rem' }}>
            ⚙️ Configurar postos esperados
          </div>
          <table className="tabela tabela-sm" style={{ marginBottom: '1rem' }}>
            <thead>
              <tr>
                <th>Posto</th>
                <th>Palavra-chave (para reconhecer no extrato)</th>
                <th>Frequência</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {postos.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.nome}</td>
                  <td><code style={{ fontSize: 11, background: '#e2e8f0', padding: '2px 6px', borderRadius: 4 }}>{p.chave}</code></td>
                  <td>
                    <select
                      value={p.frequencia}
                      onChange={e => alterarFrequencia(p.id, e.target.value as Frequencia)}
                      style={{ fontSize: 12, padding: '3px 6px', borderRadius: 5, border: '1px solid var(--border)', fontFamily: 'inherit' }}
                    >
                      <option value="semanal">Semanal</option>
                      <option value="quinzenal">Quinzenal</option>
                      <option value="mensal">Mensal</option>
                      <option value="esporadico">Esporádico</option>
                    </select>
                  </td>
                  <td>
                    <button onClick={() => removerPosto(p.id)} style={{
                      padding: '3px 8px', fontSize: 11,
                      background: '#fef2f2', color: '#dc2626',
                      border: '1px solid #fca5a5', borderRadius: 5,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}>Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {adicionando ? (
            <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--navy)' }}>Novo posto</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div className="filtro-grupo" style={{ flex: 2, minWidth: 180 }}>
                  <label className="filtro-label">Nome de exibição</label>
                  <input value={novoNome} onChange={e => setNovoNome(e.target.value)}
                    placeholder="Ex: Posto Silva Campinas"
                    style={{ padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit', width: '100%' }}
                  />
                </div>
                <div className="filtro-grupo" style={{ flex: 2, minWidth: 180 }}>
                  <label className="filtro-label">Palavra-chave do extrato</label>
                  <input value={novaChave} onChange={e => setNovaChave(e.target.value.toUpperCase())}
                    placeholder="Ex: POSTO SILVA"
                    style={{ padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit', width: '100%' }}
                  />
                </div>
                <div className="filtro-grupo">
                  <label className="filtro-label">Frequência</label>
                  <select value={novaFreq} onChange={e => setNovaFreq(e.target.value as Frequencia)}
                    style={{ padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit' }}
                  >
                    <option value="semanal">Semanal</option>
                    <option value="quinzenal">Quinzenal</option>
                    <option value="mensal">Mensal</option>
                    <option value="esporadico">Esporádico</option>
                  </select>
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                A palavra-chave é usada para reconhecer o posto nos extratos. Use parte do nome como aparece no sistema (ex: "SKINA ITALIANOS", "SAO BENEDITO").
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={adicionarPosto} disabled={!novoNome.trim() || !novaChave.trim()} style={{
                  padding: '6px 16px', fontSize: 13, fontWeight: 600,
                  background: 'var(--navy)', color: 'white',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                  fontFamily: 'inherit', opacity: !novoNome.trim() || !novaChave.trim() ? 0.5 : 1,
                }}>Adicionar</button>
                <button onClick={() => { setAdicionando(false); setNovoNome(''); setNovaChave('') }} style={{
                  padding: '6px 12px', fontSize: 13,
                  background: 'white', color: 'var(--text-2)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdicionando(true)} style={{
              padding: '6px 14px', fontSize: 13, fontWeight: 600,
              background: 'white', color: 'var(--navy)',
              border: '1px solid var(--navy)', borderRadius: 6,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>+ Adicionar posto</button>
          )}
        </div>
      )}

      {/* ── Lista de status por posto ── */}
      <div className="tabela-hist-wrap">
        <div className="grafico-titulo" style={{ marginBottom: '1rem' }}>
          Controle de extratos — {nomeMes(mesSel)} {anoSel}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {statusPostos.map(({ posto, status, recebido, esperado, totalValor, totalLitros, periodos }) => {
            const c = statusColor(status)
            return (
              <div key={posto.id} style={{
                background: c.bg, border: `1px solid ${c.border}`,
                borderRadius: 10, padding: '0.875rem 1rem',
                display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
              }}>
                {/* Ícone + nome */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 260, flex: 1 }}>
                  <span style={{ fontSize: 18 }}>{c.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)' }}>{posto.nome}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{FREQUENCIA_LABEL[posto.frequencia]}</div>
                  </div>
                </div>

                {/* Contadores */}
                <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>
                      {posto.frequencia !== 'esporadico' ? `${recebido}/${esperado}` : recebido}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>extratos</div>
                  </div>

                  {recebido > 0 && (
                    <>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)' }}>{fmt(totalValor)}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>total R$</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--navy)' }}>{fmtL(totalLitros)}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>litros</div>
                      </div>
                    </>
                  )}
                </div>

                {/* Períodos recebidos */}
                {periodos.length > 0 && (
                  <div style={{ flex: 2, minWidth: 200 }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Períodos recebidos:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {periodos.map((p, i) => (
                        <div key={i} style={{
                          fontSize: 11, background: 'white', padding: '2px 8px',
                          borderRadius: 4, border: `1px solid ${c.border}`,
                          color: 'var(--text)', display: 'inline-block',
                        }}>📅 {p}</div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Mensagem de status */}
                {status === 'faltando' && (
                  <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600, alignSelf: 'center' }}>
                    Nenhum extrato recebido este mês
                  </div>
                )}
                {status === 'parcial' && (
                  <div style={{ fontSize: 12, color: '#d97706', fontWeight: 600, alignSelf: 'center' }}>
                    Faltam {esperado - recebido} extrato{esperado - recebido > 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
