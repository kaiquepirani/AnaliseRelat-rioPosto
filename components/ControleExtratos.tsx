'use client'
import { useState, useMemo, useEffect, useCallback } from 'react'
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
  { id: '1',  nome: 'Auto Posto Skina Italianos',        chave: 'SKINA ITALIANOS',                 frequencia: 'semanal'    },
  { id: '2',  nome: 'Posto Tiago Águas de Lindóia',      chave: 'POSTO TIAGO|PORTAL DA|QUEIJOBO', frequencia: 'quinzenal'  },
  { id: '3',  nome: 'Auto Posto Praia de São Francisco', chave: 'PRAIA DE SAO FRANCISCO',          frequencia: 'quinzenal'  },
  { id: '4',  nome: 'Cooperativa dos Cafeicultores',     chave: 'COOPERATIVA DOS CAFEICULTORES',   frequencia: 'quinzenal'  },
  { id: '5',  nome: 'Mocafor Mococa',                    chave: 'MOCAFOR',                         frequencia: 'quinzenal'  },
  { id: '6',  nome: 'Irmãos Miguel Morungaba',           chave: 'IRMAOS MIGUEL',                   frequencia: 'quinzenal'  },
  { id: '7',  nome: 'Itapirense Escolar',                chave: 'ITAPIRENSE',                      frequencia: 'quinzenal'  },
  { id: '8',  nome: 'Posto JL Aguaí',                    chave: 'JL AGUAI',                        frequencia: 'quinzenal'  },
  { id: '9',  nome: 'Posto Abastece Rio Claro',          chave: 'ABASTECE RIO CLARO',              frequencia: 'quinzenal'  },
  { id: '10', nome: 'Posto RVM Mogi Mirim',              chave: 'RVM MOGI',                        frequencia: 'quinzenal'  },
  { id: '13', nome: 'Auto Posto Vitória Mogi Mirim',     chave: 'VITORIA DE MOGI MIRIM',           frequencia: 'quinzenal'  },
  { id: '11', nome: 'Auto Posto São Benedito',           chave: 'SAO BENEDITO',                    frequencia: 'mensal'     },
  { id: '12', nome: 'Tanque Águas (Interno)',            chave: 'TANQUE AGUAS',                    frequencia: 'esporadico' },
]

const FREQUENCIA_LABEL: Record<Frequencia, string> = {
  semanal:    'Semanal (~4/mês)',
  quinzenal:  'Quinzenal (2/mês)',
  mensal:     'Mensal (1/mês)',
  esporadico: 'Esporádico',
}

const FREQUENCIA_BADGE: Record<Frequencia, string> = {
  semanal: '4/mês', quinzenal: '2/mês', mensal: '1/mês', esporadico: 'esp.',
}

const ESPERADO_MES: Record<Frequencia, number> = {
  semanal: 4, quinzenal: 2, mensal: 1, esporadico: 0,
}

const NOMES_MES_CURTO = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
const NOMES_MES_LONGO = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                          'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function nomeMesCurto(mes: number): string { return NOMES_MES_CURTO[mes] }
function nomeMesLongo(mes: number): string { return NOMES_MES_LONGO[mes] }

function parsarDataBR(s: string): Date | null {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return null
  let ano = parseInt(m[3])
  if (ano < 100) ano += ano < 50 ? 2000 : 1900
  return new Date(ano, parseInt(m[2]) - 1, parseInt(m[1]))
}

function extratoCobreMes(periodo: string, mes: number, ano: number): boolean {
  const partes = periodo.split(' a ')
  const dataInicio = parsarDataBR(partes[0]?.trim() || '')
  const dataFim = parsarDataBR(partes[1]?.trim() || '')
  if (!dataInicio || !dataFim) return false
  const primeiroDia = new Date(ano, mes, 1)
  const ultimoDia = new Date(ano, mes + 1, 0)
  return dataInicio <= ultimoDia && dataFim >= primeiroDia
}

function matchPosto(nomeExtrato: string, chave: string): boolean {
  const n = nomeExtrato.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return chave.split('|').some(c => {
    const cn = c.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return n.includes(cn)
  })
}

function chaveJustificativa(postoId: string, mes: number, ano: number): string {
  return `controle_just__${postoId}__${ano}_${mes}`
}

function mesJaEncerrado(mes: number, ano: number, hoje: Date): boolean {
  return ano < hoje.getFullYear() ||
    (ano === hoje.getFullYear() && mes < hoje.getMonth())
}

function mesEhAtual(mes: number, ano: number, hoje: Date): boolean {
  return ano === hoje.getFullYear() && mes === hoje.getMonth()
}

// Tipo de status pra cada célula do grid
type StatusCelula = 'ok' | 'parcial' | 'faltando' | 'justificado' | 'esporadico' | 'aguardando' | 'futuro' | 'sem_dados'

interface CelulaStatus {
  status: StatusCelula
  recebido: number
  esperado: number
  totalValor: number
  totalLitros: number
  periodos: string[]
  chaveJust: string
  justificativa?: string
}

export default function ControleExtratos({ extratos }: { extratos: Extrato[] }) {
  const hoje = new Date()
  const [postos, setPostos] = useState<PostoEsperado[]>(POSTOS_PADRAO)
  const [editandoPostos, setEditandoPostos] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novaChave, setNovaChave] = useState('')
  const [novaFreq, setNovaFreq] = useState<Frequencia>('quinzenal')
  const [adicionando, setAdicionando] = useState(false)

  const [justificativas, setJustificativas] = useState<Record<string, string>>({})

  // Drawer/modal de detalhe da célula clicada
  const [celulaAberta, setCelulaAberta] = useState<{ postoId: string; mes: number; ano: number } | null>(null)
  const [textoJust, setTextoJust] = useState('')

  // Janela de 6 meses — termina no mês atual e mostra os 5 anteriores + atual = 6 meses
  // Usuário pode navegar
  const [mesFimVisao, setMesFimVisao] = useState(hoje.getMonth())
  const [anoFimVisao, setAnoFimVisao] = useState(hoje.getFullYear())

  // Gera array de 6 meses ordenados do mais antigo (esquerda) ao mais novo (direita)
  const mesesVisaveis = useMemo(() => {
    const arr: { mes: number; ano: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(anoFimVisao, mesFimVisao - i, 1)
      arr.push({ mes: d.getMonth(), ano: d.getFullYear() })
    }
    return arr
  }, [mesFimVisao, anoFimVisao])

  useEffect(() => {
    try {
      const salvoJust = localStorage.getItem('controle_justificativas')
      if (salvoJust) setJustificativas(JSON.parse(salvoJust))

      const salvoPostos = localStorage.getItem('controle_postos')
      if (salvoPostos) {
        const salvos: PostoEsperado[] = JSON.parse(salvoPostos)
        const merged = POSTOS_PADRAO.map(padrao => {
          const salvo = salvos.find((s: PostoEsperado) => s.id === padrao.id)
            || salvos.find((s: PostoEsperado) => s.nome === padrao.nome)
          if (salvo) return { ...padrao, frequencia: salvo.frequencia }
          return padrao
        })
        const idsPadrao = new Set(POSTOS_PADRAO.map(p => p.id))
        const extras = salvos.filter((s: PostoEsperado) => !idsPadrao.has(s.id))
        setPostos([...merged, ...extras])
        localStorage.setItem('controle_postos', JSON.stringify([...merged, ...extras]))
      }
    } catch {}
  }, [])

  const salvarPostos = (lista: PostoEsperado[]) => {
    setPostos(lista)
    try { localStorage.setItem('controle_postos', JSON.stringify(lista)) } catch {}
  }

  const salvarJustificativa = useCallback((chave: string, texto: string) => {
    setJustificativas(prev => {
      const novo = { ...prev }
      if (texto.trim()) novo[chave] = texto.trim()
      else delete novo[chave]
      try { localStorage.setItem('controle_justificativas', JSON.stringify(novo)) } catch {}
      return novo
    })
  }, [])

  // Pré-calcula matriz: para cada posto x mês, qual o status?
  const matriz = useMemo(() => {
    const map: Record<string, Record<string, CelulaStatus>> = {}

    for (const posto of postos) {
      map[posto.id] = {}
      for (const { mes, ano } of mesesVisaveis) {
        const ehFuturo = ano > hoje.getFullYear() ||
          (ano === hoje.getFullYear() && mes > hoje.getMonth())

        if (ehFuturo) {
          map[posto.id][`${ano}_${mes}`] = {
            status: 'futuro',
            recebido: 0, esperado: ESPERADO_MES[posto.frequencia],
            totalValor: 0, totalLitros: 0,
            periodos: [],
            chaveJust: chaveJustificativa(posto.id, mes, ano),
          }
          continue
        }

        const extratosMes = extratos.filter(e => extratoCobreMes(e.periodo, mes, ano))
        const extratosDoPost = extratosMes.filter(e =>
          e.postos.some(p => matchPosto(p.nome, posto.chave))
        )
        const totalValor = extratosDoPost.reduce((s, e) =>
          s + e.postos.filter(p => matchPosto(p.nome, posto.chave))
                .reduce((ss, p) => ss + p.totalValor, 0), 0)
        const totalLitros = extratosDoPost.reduce((s, e) =>
          s + e.postos.filter(p => matchPosto(p.nome, posto.chave))
                .reduce((ss, p) => ss + p.totalLitros, 0), 0)

        const esperado = ESPERADO_MES[posto.frequencia]
        const recebido = extratosDoPost.length
        const chaveJust = chaveJustificativa(posto.id, mes, ano)
        const justificativa = justificativas[chaveJust]
        const justificado = !!justificativa
        const encerrado = mesJaEncerrado(mes, ano, hoje)

        let status: StatusCelula
        if (posto.frequencia === 'esporadico') {
          status = recebido > 0 ? 'ok' : 'esporadico'
        } else if (!encerrado) {
          status = recebido >= esperado ? 'ok'
            : justificado ? 'justificado'
            : 'aguardando'
        } else if (justificado) {
          status = 'justificado'
        } else if (recebido === 0) {
          status = 'faltando'
        } else if (recebido >= esperado) {
          status = 'ok'
        } else {
          status = 'parcial'
        }

        map[posto.id][`${ano}_${mes}`] = {
          status, recebido, esperado, totalValor, totalLitros,
          periodos: extratosDoPost.map(e => e.periodo),
          chaveJust, justificativa,
        }
      }
    }
    return map
  }, [postos, extratos, mesesVisaveis, justificativas])

  // Resumo da janela visível (totais)
  const resumoVisao = useMemo(() => {
    let totalCelulas = 0
    let ok = 0, parcial = 0, faltando = 0, justificado = 0, aguardando = 0
    let totalValor = 0
    for (const posto of postos) {
      for (const { mes, ano } of mesesVisaveis) {
        const cel = matriz[posto.id]?.[`${ano}_${mes}`]
        if (!cel) continue
        if (cel.status === 'futuro' || cel.status === 'esporadico') continue
        totalCelulas++
        totalValor += cel.totalValor
        if (cel.status === 'ok') ok++
        else if (cel.status === 'parcial') parcial++
        else if (cel.status === 'faltando') faltando++
        else if (cel.status === 'justificado') justificado++
        else if (cel.status === 'aguardando') aguardando++
      }
    }
    return { totalCelulas, ok, parcial, faltando, justificado, aguardando, totalValor }
  }, [postos, mesesVisaveis, matriz])

  const removerPosto = (id: string) => salvarPostos(postos.filter(p => p.id !== id))
  const alterarFrequencia = (id: string, freq: Frequencia) => {
    salvarPostos(postos.map(p => p.id === id ? { ...p, frequencia: freq } : p))
  }
  const adicionarPosto = () => {
    if (!novoNome.trim() || !novaChave.trim()) return
    salvarPostos([...postos, {
      id: Date.now().toString(),
      nome: novoNome.trim(),
      chave: novaChave.trim().toUpperCase(),
      frequencia: novaFreq,
    }])
    setNovoNome(''); setNovaChave(''); setNovaFreq('quinzenal'); setAdicionando(false)
  }

  const navegarMeses = (delta: number) => {
    const nova = new Date(anoFimVisao, mesFimVisao + delta, 1)
    setMesFimVisao(nova.getMonth())
    setAnoFimVisao(nova.getFullYear())
  }

  const irParaAtual = () => {
    setMesFimVisao(hoje.getMonth())
    setAnoFimVisao(hoje.getFullYear())
  }

  // Drawer/detalhe de célula
  const abrirCelula = (postoId: string, mes: number, ano: number) => {
    setCelulaAberta({ postoId, mes, ano })
    const chave = chaveJustificativa(postoId, mes, ano)
    setTextoJust(justificativas[chave] || '')
  }

  const fecharCelula = () => {
    setCelulaAberta(null)
    setTextoJust('')
  }

  const salvarJustNoDrawer = () => {
    if (!celulaAberta) return
    const chave = chaveJustificativa(celulaAberta.postoId, celulaAberta.mes, celulaAberta.ano)
    salvarJustificativa(chave, textoJust)
    fecharCelula()
  }

  const removerJustNoDrawer = () => {
    if (!celulaAberta) return
    const chave = chaveJustificativa(celulaAberta.postoId, celulaAberta.mes, celulaAberta.ano)
    salvarJustificativa(chave, '')
    setTextoJust('')
    fecharCelula()
  }

  const podeNavegarFrente = () => {
    return anoFimVisao < hoje.getFullYear() ||
      (anoFimVisao === hoje.getFullYear() && mesFimVisao < hoje.getMonth())
  }

  const corCelula = (s: StatusCelula) => {
    if (s === 'ok')           return { bg: '#f0fdf4', color: '#16a34a', border: '#86efac' }
    if (s === 'justificado')  return { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' }
    if (s === 'parcial')      return { bg: '#fffbeb', color: '#b45309', border: '#fcd34d' }
    if (s === 'faltando')     return { bg: '#fef2f2', color: '#dc2626', border: '#fca5a5' }
    if (s === 'aguardando')   return { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0' }
    if (s === 'esporadico')   return { bg: '#f8fafc', color: '#94a3b8', border: '#e2e8f0' }
    return                          { bg: '#fafafa', color: '#cbd5e1', border: '#f1f5f9' }
  }

  // Posto/mes selecionados pra mostrar drawer
  const detalheCelula = celulaAberta ? matriz[celulaAberta.postoId]?.[`${celulaAberta.ano}_${celulaAberta.mes}`] : null
  const postoSelecionado = celulaAberta ? postos.find(p => p.id === celulaAberta.postoId) : null

  // Range label
  const rangeLabel = `${nomeMesCurto(mesesVisaveis[0].mes)}/${String(mesesVisaveis[0].ano).slice(2)} — ${nomeMesCurto(mesesVisaveis[5].mes)}/${String(mesesVisaveis[5].ano).slice(2)}`

  return (
    <div className="analise-veiculo">

      {/* ── Cabeçalho de navegação 6 meses ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: '1.25rem', flexWrap: 'wrap',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '0.875rem 1rem',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navegarMeses(-6)} style={navBtnStyle}>← 6 meses</button>
          <button onClick={() => navegarMeses(-1)} style={navBtnStyle}>‹</button>
          <button onClick={irParaAtual} style={{
            ...navBtnStyle, background: 'var(--navy)', color: 'white', border: '1px solid var(--navy)',
          }}>Hoje</button>
          <button onClick={() => navegarMeses(1)} disabled={!podeNavegarFrente()} style={{
            ...navBtnStyle,
            opacity: podeNavegarFrente() ? 1 : 0.4,
            cursor: podeNavegarFrente() ? 'pointer' : 'not-allowed',
          }}>›</button>
          <button onClick={() => navegarMeses(6)} disabled={!podeNavegarFrente()} style={{
            ...navBtnStyle,
            opacity: podeNavegarFrente() ? 1 : 0.4,
            cursor: podeNavegarFrente() ? 'pointer' : 'not-allowed',
          }}>6 meses →</button>
        </div>
        <div style={{
          fontSize: 14, fontWeight: 700, color: 'var(--navy)',
          padding: '6px 14px', background: 'var(--sky-light)',
          borderRadius: 8, border: '1px solid var(--sky-mid)',
        }}>
          {rangeLabel}
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button onClick={() => setEditandoPostos(v => !v)} style={{
            padding: '0.5rem 1rem', fontSize: 12, fontWeight: 600,
            background: editandoPostos ? 'var(--navy)' : 'white',
            color: editandoPostos ? 'white' : 'var(--navy)',
            border: '1px solid var(--navy)', borderRadius: 8,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>⚙️ {editandoPostos ? 'Fechar configuração' : 'Configurar postos'}</button>
        </div>
      </div>

      {/* ── Cards resumo da janela ── */}
      <div className="cards-grid" style={{ marginBottom: '1.25rem' }}>
        <div className="card card-ok">
          <div className="card-label">Em dia / justificados</div>
          <div className="card-valor" style={{ color: '#16a34a' }}>{resumoVisao.ok + resumoVisao.justificado}</div>
          <div className="card-sub">de {resumoVisao.totalCelulas} células</div>
        </div>
        <div className="card" style={{ borderColor: resumoVisao.parcial > 0 ? '#fcd34d' : 'var(--border)', background: resumoVisao.parcial > 0 ? '#fffbeb' : 'white' }}>
          <div className="card-label">Parciais</div>
          <div className="card-valor" style={{ color: resumoVisao.parcial > 0 ? '#b45309' : '#64748b' }}>{resumoVisao.parcial}</div>
          <div className="card-sub">recebido &lt; esperado</div>
        </div>
        <div className="card card-alerta">
          <div className="card-label">Faltando</div>
          <div className="card-valor" style={{ color: '#dc2626' }}>{resumoVisao.faltando}</div>
          <div className="card-sub">sem extrato e sem justificativa</div>
        </div>
        <div className="card">
          <div className="card-label">Total recebido (período)</div>
          <div className="card-valor">{fmt(resumoVisao.totalValor)}</div>
          <div className="card-sub">{rangeLabel}</div>
        </div>
      </div>

      {/* ── Configuração de postos ── */}
      {editandoPostos && (
        <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--navy)', marginBottom: '0.5rem' }}>⚙️ Configurar postos esperados</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: '1rem' }}>
            Separe múltiplas palavras-chave com <code style={{ background: '#e2e8f0', padding: '1px 5px', borderRadius: 3 }}>|</code> para que diferentes nomes de extrato sejam reconhecidos como o mesmo posto.
          </div>
          <table className="tabela tabela-sm" style={{ marginBottom: '1rem' }}>
            <thead>
              <tr><th>Posto</th><th>Palavra(s)-chave</th><th>Frequência</th><th></th></tr>
            </thead>
            <tbody>
              {postos.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.nome}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {p.chave.split('|').map((c, i) => (
                        <code key={i} style={{ fontSize: 11, background: '#e2e8f0', padding: '2px 6px', borderRadius: 4 }}>{c.trim()}</code>
                      ))}
                    </div>
                  </td>
                  <td>
                    <select value={p.frequencia} onChange={e => alterarFrequencia(p.id, e.target.value as Frequencia)}
                      style={{ fontSize: 12, padding: '3px 6px', borderRadius: 5, border: '1px solid var(--border)', fontFamily: 'inherit' }}>
                      <option value="semanal">Semanal</option>
                      <option value="quinzenal">Quinzenal</option>
                      <option value="mensal">Mensal</option>
                      <option value="esporadico">Esporádico</option>
                    </select>
                  </td>
                  <td>
                    <button onClick={() => removerPosto(p.id)} style={{ padding: '3px 8px', fontSize: 11, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Remover
                    </button>
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
                  <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Ex: Posto Silva Campinas"
                    style={{ padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit', width: '100%' }} />
                </div>
                <div className="filtro-grupo" style={{ flex: 2, minWidth: 180 }}>
                  <label className="filtro-label">Palavra(s)-chave — separe com |</label>
                  <input value={novaChave} onChange={e => setNovaChave(e.target.value.toUpperCase())} placeholder="Ex: POSTO SILVA|SILVA CAMP"
                    style={{ padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit', width: '100%' }} />
                </div>
                <div className="filtro-grupo">
                  <label className="filtro-label">Frequência</label>
                  <select value={novaFreq} onChange={e => setNovaFreq(e.target.value as Frequencia)}
                    style={{ padding: '6px 10px', fontSize: 13, borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit' }}>
                    <option value="semanal">Semanal</option>
                    <option value="quinzenal">Quinzenal</option>
                    <option value="mensal">Mensal</option>
                    <option value="esporadico">Esporádico</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={adicionarPosto} disabled={!novoNome.trim() || !novaChave.trim()} style={{ padding: '6px 16px', fontSize: 13, fontWeight: 600, background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', opacity: !novoNome.trim() || !novaChave.trim() ? 0.5 : 1 }}>Adicionar</button>
                <button onClick={() => { setAdicionando(false); setNovoNome(''); setNovaChave('') }} style={{ padding: '6px 12px', fontSize: 13, background: 'white', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdicionando(true)} style={{ padding: '6px 14px', fontSize: 13, fontWeight: 600, background: 'white', color: 'var(--navy)', border: '1px solid var(--navy)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
              + Adicionar posto
            </button>
          )}
        </div>
      )}

      {/* ── GRID PRINCIPAL — calendário semestral ── */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '14px 18px', borderBottom: '1px solid var(--border)',
          background: '#f8fafc',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 10,
        }}>
          <div className="grafico-titulo" style={{ margin: 0 }}>
            📅 Mapa de extratos — {rangeLabel}
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>
            Clique em uma célula para ver detalhes ou adicionar justificativa
          </div>
        </div>

        {/* Legenda */}
        <div style={{
          padding: '10px 18px', borderBottom: '1px solid var(--border)',
          background: 'white', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center',
          fontSize: 11, color: '#64748b',
        }}>
          <span style={{ fontWeight: 600 }}>Legenda:</span>
          <LegendaItem cor="#16a34a" bg="#f0fdf4" label="Em dia" />
          <LegendaItem cor="#2563eb" bg="#eff6ff" label="Justificado" />
          <LegendaItem cor="#b45309" bg="#fffbeb" label="Parcial" />
          <LegendaItem cor="#dc2626" bg="#fef2f2" label="Faltando" />
          <LegendaItem cor="#64748b" bg="#f8fafc" label="Aguardando (mês atual)" />
          <LegendaItem cor="#cbd5e1" bg="#fafafa" label="Futuro" />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'separate',
            borderSpacing: 0,
            fontSize: 13,
            minWidth: 800,
          }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{
                  padding: '10px 14px', textAlign: 'left',
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.04,
                  color: 'var(--text-3)', borderBottom: '2px solid var(--border)',
                  position: 'sticky', left: 0, background: '#f8fafc', zIndex: 2, minWidth: 240,
                }}>Posto</th>
                {mesesVisaveis.map(({ mes, ano }) => {
                  const ehAtual = mesEhAtual(mes, ano, hoje)
                  return (
                    <th key={`${ano}_${mes}`} style={{
                      padding: '10px 8px', textAlign: 'center',
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.04,
                      color: ehAtual ? 'var(--navy)' : 'var(--text-3)',
                      borderBottom: '2px solid var(--border)',
                      background: ehAtual ? 'var(--sky-light)' : '#f8fafc',
                      minWidth: 80,
                    }}>
                      <div>{nomeMesCurto(mes)}</div>
                      <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.7 }}>/{String(ano).slice(2)}</div>
                      {ehAtual && (
                        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--navy)', marginTop: 2 }}>HOJE</div>
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {postos.map((posto, idx) => (
                <tr key={posto.id} style={{ background: idx % 2 === 0 ? 'white' : '#fcfcfd' }}>
                  <td style={{
                    padding: '12px 14px',
                    borderBottom: '1px solid var(--border)',
                    position: 'sticky', left: 0, zIndex: 1,
                    background: idx % 2 === 0 ? 'white' : '#fcfcfd',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--navy)' }}>{posto.nome}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 600,
                        background: posto.frequencia === 'esporadico' ? '#f1f5f9' : 'var(--sky-light)',
                        color: posto.frequencia === 'esporadico' ? '#64748b' : 'var(--navy)',
                        border: `1px solid ${posto.frequencia === 'esporadico' ? '#e2e8f0' : 'var(--sky-mid)'}`,
                        padding: '1px 7px', borderRadius: 10,
                      }}>{FREQUENCIA_BADGE[posto.frequencia]}</span>
                      {posto.chave.includes('|') && (
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>
                          {posto.chave.split('|').length} aliases
                        </span>
                      )}
                    </div>
                  </td>

                  {mesesVisaveis.map(({ mes, ano }) => {
                    const cel = matriz[posto.id]?.[`${ano}_${mes}`]
                    if (!cel) return <td key={`${ano}_${mes}`} style={tdGridStyle}>—</td>

                    const c = corCelula(cel.status)
                    const isFuturo = cel.status === 'futuro'
                    const isEsporadico = cel.status === 'esporadico'

                    return (
                      <td key={`${ano}_${mes}`} style={{
                        padding: 4,
                        borderBottom: '1px solid var(--border)',
                        textAlign: 'center',
                        verticalAlign: 'middle',
                      }}>
                        {isFuturo ? (
                          <div style={{
                            padding: '12px 6px',
                            fontSize: 14, color: '#cbd5e1', fontWeight: 600,
                          }}>—</div>
                        ) : isEsporadico ? (
                          <div style={{
                            padding: '12px 6px',
                            fontSize: 12, color: '#94a3b8',
                          }}>—</div>
                        ) : (
                          <button
                            onClick={() => abrirCelula(posto.id, mes, ano)}
                            title={`${posto.nome} — ${nomeMesLongo(mes)}/${ano}\nClique para ver detalhes`}
                            style={{
                              width: '100%', padding: '10px 4px',
                              background: c.bg,
                              border: `1.5px solid ${c.border}`,
                              borderRadius: 8,
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              transition: 'all 0.15s',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'scale(1.05)'
                              e.currentTarget.style.boxShadow = `0 2px 8px ${c.border}`
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'scale(1)'
                              e.currentTarget.style.boxShadow = 'none'
                            }}
                          >
                            <div style={{
                              fontSize: 16, fontWeight: 700, color: c.color,
                              fontFamily: 'DM Mono, monospace', letterSpacing: '-0.02em',
                            }}>
                              {cel.recebido}/{cel.esperado}
                            </div>
                            {cel.justificativa && (
                              <div style={{ fontSize: 9, color: c.color, fontWeight: 600, lineHeight: 1 }}>📝 just.</div>
                            )}
                            {cel.totalValor > 0 && !cel.justificativa && (
                              <div style={{ fontSize: 9, color: c.color, opacity: 0.7, lineHeight: 1, fontFamily: 'DM Mono, monospace' }}>
                                {cel.totalValor >= 1000
                                  ? `R$${(cel.totalValor / 1000).toFixed(0)}k`
                                  : `R$${cel.totalValor.toFixed(0)}`}
                              </div>
                            )}
                          </button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── DRAWER de detalhe da célula ── */}
      {celulaAberta && detalheCelula && postoSelecionado && (() => {
        const c = corCelula(detalheCelula.status)
        const encerrado = mesJaEncerrado(celulaAberta.mes, celulaAberta.ano, hoje)
        const podeJustificar = encerrado && (
          detalheCelula.status === 'faltando' ||
          detalheCelula.status === 'parcial' ||
          detalheCelula.status === 'justificado'
        )
        return (
          <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(15,23,42,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '1rem',
          }} onClick={fecharCelula}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'white', borderRadius: 14, padding: '1.5rem',
              maxWidth: 540, width: '100%',
              maxHeight: '92vh', overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: '1rem' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {nomeMesLongo(celulaAberta.mes)}/{celulaAberta.ano}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)', marginTop: 2 }}>
                    {postoSelecionado.nome}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {FREQUENCIA_LABEL[postoSelecionado.frequencia]}
                  </div>
                </div>
                <button onClick={fecharCelula} style={{
                  background: 'transparent', border: 'none', fontSize: 22, color: '#94a3b8',
                  cursor: 'pointer', padding: 0, lineHeight: 1,
                }}>×</button>
              </div>

              {/* Status grande */}
              <div style={{
                background: c.bg, border: `1px solid ${c.border}`,
                borderRadius: 10, padding: '12px 16px', marginBottom: '1rem',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: c.color, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {detalheCelula.status === 'ok' && 'Em dia'}
                    {detalheCelula.status === 'parcial' && 'Parcial'}
                    {detalheCelula.status === 'faltando' && 'Faltando'}
                    {detalheCelula.status === 'justificado' && 'Justificado'}
                    {detalheCelula.status === 'aguardando' && 'Aguardando'}
                    {detalheCelula.status === 'esporadico' && 'Esporádico'}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: c.color, fontFamily: 'DM Mono, monospace', marginTop: 4 }}>
                    {detalheCelula.recebido}/{detalheCelula.esperado} extratos
                  </div>
                  {detalheCelula.recebido < detalheCelula.esperado && encerrado && !detalheCelula.justificativa && (
                    <div style={{ fontSize: 12, color: c.color, marginTop: 4, fontWeight: 600 }}>
                      Faltam {detalheCelula.esperado - detalheCelula.recebido} extrato{detalheCelula.esperado - detalheCelula.recebido > 1 ? 's' : ''}
                    </div>
                  )}
                  {!encerrado && detalheCelula.recebido < detalheCelula.esperado && (
                    <div style={{ fontSize: 12, color: c.color, marginTop: 4 }}>
                      Mês em andamento — alertas inativos
                    </div>
                  )}
                </div>
                {detalheCelula.recebido > 0 && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>
                      {fmt(detalheCelula.totalValor)}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {fmtL(detalheCelula.totalLitros)}
                    </div>
                  </div>
                )}
              </div>

              {/* Períodos recebidos */}
              {detalheCelula.periodos.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                    Períodos recebidos
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {detalheCelula.periodos.map((p, i) => (
                      <div key={i} style={{
                        fontSize: 13, padding: '6px 10px',
                        background: '#f8fafc', borderRadius: 6,
                        border: '1px solid var(--border)', color: 'var(--text)',
                      }}>📅 {p}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Justificativa */}
              {(podeJustificar || detalheCelula.justificativa) && (
                <div style={{
                  background: '#fffbeb', border: '1px solid #fcd34d',
                  borderRadius: 10, padding: '12px 14px',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
                    📝 Justificativa
                  </div>
                  <textarea
                    value={textoJust}
                    onChange={e => setTextoJust(e.target.value)}
                    placeholder="Ex: Férias escolares — sem abastecimento previsto neste período"
                    style={{
                      width: '100%', fontSize: 13, padding: '8px 10px',
                      border: '1px solid #fcd34d', borderRadius: 6,
                      fontFamily: 'inherit', resize: 'vertical', minHeight: 70,
                      background: 'white', color: 'var(--text)', boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                    {detalheCelula.justificativa && (
                      <button onClick={removerJustNoDrawer} style={{
                        padding: '7px 14px', fontSize: 12, fontWeight: 600,
                        background: '#fef2f2', color: '#dc2626',
                        border: '1px solid #fca5a5', borderRadius: 6,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}>Remover justificativa</button>
                    )}
                    <button onClick={salvarJustNoDrawer} disabled={!textoJust.trim()} style={{
                      padding: '7px 16px', fontSize: 12, fontWeight: 600,
                      background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 6,
                      cursor: textoJust.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                      opacity: textoJust.trim() ? 1 : 0.5,
                    }}>{detalheCelula.justificativa ? 'Atualizar' : 'Salvar'} justificativa</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

const navBtnStyle: React.CSSProperties = {
  padding: '6px 12px', fontSize: 12, fontWeight: 600,
  background: 'white', color: 'var(--navy)',
  border: '1px solid var(--border)', borderRadius: 6,
  cursor: 'pointer', fontFamily: 'inherit',
  transition: 'all 0.15s',
}

const tdGridStyle: React.CSSProperties = {
  padding: 4, borderBottom: '1px solid var(--border)', textAlign: 'center',
}

const LegendaItem = ({ cor, bg, label }: { cor: string; bg: string; label: string }) => (
  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
    <span style={{
      display: 'inline-block', width: 14, height: 14,
      background: bg, border: `1.5px solid ${cor}`, borderRadius: 3,
    }} />
    {label}
  </span>
)
