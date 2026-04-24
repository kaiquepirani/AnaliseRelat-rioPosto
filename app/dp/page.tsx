'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import CadastroColaboradores from '@/components/dp/CadastroColaboradores'
import ControlePagamentos from '@/components/dp/ControlePagamentos'
import ResumoDPGeral from '@/components/dp/ResumoDPGeral'
import { Colaborador, Cidade, Funcao } from '@/lib/dp-types'

type Aba = 'resumo' | 'pagamentos' | 'colaboradores'

const MAPA_CIDADES: Record<string, Cidade> = {
  'FOLHA AGUAS':        'Águas de Lindóia (Folha)',
  'ÁGUAS (FOLHA)':      'Águas de Lindóia (Folha)',
  'AGUAS (FOLHA)':      'Águas de Lindóia (Folha)',
  'DIÁRIAS ÁGUAS':      'Águas de Lindóia (Diárias)',
  'ÁGUAS (DIÁRIAS)':    'Águas de Lindóia (Diárias)',
  'AGUAS (DIARIAS)':    'Águas de Lindóia (Diárias)',
  'MORUNGABA':          'Morungaba',
  'MOGI MIRIM':         'Mogi Mirim',
  'ITAPIRA (ESCOLAR)':  'Itapira (Escolar)',
  'ESCOLAR ITAPIRA':    'Itapira (Escolar)',
  'ITAPIRA ESCOLAR':    'Itapira (Escolar)',
  'ITAPIRA (SAÚDE)':    'Itapira (Saúde)',
  'ITAPIRA (SAUDE)':    'Itapira (Saúde)',
  'ITAPIRA SAUDE':      'Itapira (Saúde)',
  'ITAPIRA SAÚDE':      'Itapira (Saúde)',
  'ITAPIRA':            'Itapira (Saúde)',
  'SAUDE ITAPIRA':      'Itapira (Saúde)',
  'AGUAÍ':              'Aguaí',
  'AGUAI':              'Aguaí',
  'CASA BRANCA':        'Casa Branca',
  'PINHAL':             'Pinhal',
  'UBATUBA':            'Ubatuba',
  'PORTO FERREIRA':     'Porto Ferreira',
  'LINDÓIA':            'Lindóia',
  'LINDOIA':            'Lindóia',
  'MOCOCA':             'Mococa',
  'RIO CLARO':          'Rio Claro',
}

// Abas que usam Formato B (CPF/CNPJ header → nome col3 → TOTAL col5)
const ABAS_FORMATO_B = new Set([
  'ÁGUAS (DIÁRIAS)', 'AGUAS (DIARIAS)', 'DIÁRIAS ÁGUAS',
  'ITAPIRA (SAÚDE)', 'ITAPIRA (SAUDE)', 'ITAPIRA SAÚDE', 'ITAPIRA SAUDE', 'ITAPIRA', 'SAUDE ITAPIRA',
  'PINHAL', 'MOCOCA', 'RIO CLARO', 'UBATUBA',
])

interface ColaboradorImportado {
  nome: string
  cpf?: string
  cidade: Cidade
  funcao: Funcao
  salarioBase: number
  totalReceber: number
  banco?: string
  agencia?: string
  conta?: string
  pix?: string
  observacoes?: string
  jaExiste: boolean
  colaboradorId?: string
}

interface ResultadoImportacao {
  colaboradores: ColaboradorImportado[]
  mesAno: string
  totalFolha: number
  totalReal: number
  totalPorCidade: Record<string, number>
  valorPorColaborador: Record<string, number>
  nomeArquivo: string
  tipoFolha: 'antecipacao' | 'folha'
  erros: string[]
  avisos: string[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function normalizarBanco(texto: string): string {
  const t = texto.toUpperCase()
  if (t.includes('NUBANK') || t.includes('NU PAGAMENTO')) return 'Nubank'
  if (t.includes('ITAÚ') || t.includes('ITAU')) return 'Itaú'
  if (t.includes('CAIXA')) return 'Caixa Econômica Federal'
  if (t.includes('BRADESCO')) return 'Bradesco'
  if (t.includes('SANTANDER')) return 'Santander'
  if (t.includes('BANCO DO BRASIL')) return 'Banco do Brasil'
  if (t.includes('INTER')) return 'Inter'
  if (t.includes('SICOOB')) return 'Sicoob'
  return texto.trim()
}

const NOMES_SKIP = [
  'RECIBO','PERIODO','DECLARO','CNPJ 0','HORA ','TOTAL','BANCO','DESCONT',
  'DESCONTOS','COMO M','TAIS ','ANTECIP','ETCO','PENSAO','PENSÃO',
  'UBATUBA','MORUNGABA','AGUAÍ','AGUAI','AGUAS','ÁGUAS','MOGI','ITAPIRA',
  'CASA BRANCA','PINHAL','MOCOCA','LINDÓIA','LINDOIA','RIO CLARO','PORTO',
  'ESPÍRITO SANTO','ESPIRITO SANTO','SEM REG','MECANICO','MECÂNICO',
  'AUXILIAR','ENCARREGADO','MOTORISTA SAL','CARGO','SALÁRIO R$','SALARIO R$',
  'RECIBO DE','CPF','CNPJ','INICIO','NÃO ','_','REEMBOLSO',
]

function ehNomeValido(s: string): boolean {
  if (!s || s.length < 4) return false
  if (/^\d/.test(s)) return false
  const su = s.trim().toUpperCase()
  for (const k of NOMES_SKIP) {
    if (su.startsWith(k)) return false
  }
  return true
}

// ── Formato A: nome em col1 → "TOTAL A RECEBER" col1 → valor col3 ──────────
// Usado em: Águas Folha, Morungaba, Mogi Mirim, Itapira Escolar, Aguaí, Casa Branca, Lindóia
function parsearFormatoA(dados: any[][]): { nome: string; valor: number }[] {
  const result: { nome: string; valor: number }[] = []
  for (let i = 0; i < dados.length; i++) {
    const c1 = String(dados[i]?.[1] ?? '').trim().toUpperCase()
    if (!c1.includes('TOTAL') || !c1.includes('RECEB')) continue
    const v = dados[i]?.[3]
    if (typeof v !== 'number' || v <= 0) continue
    for (let j = i - 1; j >= Math.max(i - 30, 0); j--) {
      const c = String(dados[j]?.[1] ?? '').trim()
      if (ehNomeValido(c)) { result.push({ nome: c, valor: v }); break }
    }
  }
  return result
}

// ── Formato B: "CPF"/"CNPJ" col1 → nome col3 → TOTAL col5 (1ª quinzena) ───
// Usado em: Águas Diárias, Itapira Saúde, Pinhal, Mococa, Rio Claro, Ubatuba
function parsearFormatoB(dados: any[][]): { nome: string; cpf?: string; banco?: string; valor: number }[] {
  const result: { nome: string; cpf?: string; banco?: string; valor: number }[] = []
  let i = 0
  while (i < dados.length) {
    const c1 = String(dados[i]?.[1] ?? '').trim().toUpperCase().replace(/:$/, '').trim()
    if (c1 === 'CPF' || c1 === 'CNPJ') {
      const nr = dados[i + 1]
      if (nr) {
        const cpf = String(nr[1] ?? '').trim()
        const nome = String(nr[3] ?? '').trim()
        const banco = String(nr[5] ?? '').trim()
        if (nome.length > 3) {
          for (let j = i + 2; j < Math.min(i + 55, dados.length); j++) {
            const c1j = String(dados[j]?.[1] ?? '').toUpperCase()
            // Parar se entrar na 2ª quinzena
            if (c1j.includes('QUINZENA') && /2[ªº°]/.test(c1j)) break
            if (c1j.includes('TOTAL') && (c1j.includes('RECEB') || c1j.includes('QUINZENA'))) {
              const v = dados[j]?.[5]
              if (typeof v === 'number' && v > 0) {
                result.push({ nome, cpf: cpf.length > 5 ? cpf : undefined, banco: banco || undefined, valor: v })
                break
              }
            }
          }
        }
      }
    }
    i++
  }
  return result
}

// ── Porto Ferreira: "Funcionário:" col1 → nome col3 → "Valor líquido" col4 → valor col8
function parsearPortoFerreira(dados: any[][]): { nome: string; valor: number }[] {
  const result: { nome: string; valor: number }[] = []
  for (let i = 0; i < dados.length; i++) {
    if (String(dados[i]?.[1] ?? '').trim() !== 'Funcionário:') continue
    const nome = String(dados[i]?.[3] ?? '').trim()
    for (let j = i + 1; j < Math.min(i + 20, dados.length); j++) {
      if (String(dados[j]?.[4] ?? '').includes('Valor líquido')) {
        const v = dados[j]?.[8]
        if (typeof v === 'number' && v > 0) { result.push({ nome, valor: v }); break }
      }
    }
  }
  return result
}

// ── Dispatcher principal ──────────────────────────────────────────────────
function parsearAba(dados: any[][], cidade: Cidade, chaveAba: string): ColaboradorImportado[] {
  type Extraido = { nome: string; cpf?: string; banco?: string; valor: number }
  let extraidos: Extraido[] = []

  if (chaveAba === 'PORTO FERREIRA') {
    extraidos = parsearPortoFerreira(dados)
  } else if (ABAS_FORMATO_B.has(chaveAba)) {
    extraidos = parsearFormatoB(dados)
  } else {
    extraidos = parsearFormatoA(dados)
  }

  // Fallback: se não extraiu nenhum, registrar total da cidade como __TOTAL__
  if (extraidos.length === 0) {
    let total = 0
    for (const row of dados) {
      const c1 = String(row?.[1] ?? '').toUpperCase()
      if (c1.includes('TOTAL') && c1.includes('RECEB')) {
        const v5 = row?.[5]; const v3 = row?.[3]
        if (typeof v5 === 'number' && v5 > 0) { total += v5; break }
        if (typeof v3 === 'number' && v3 > 0) { total += v3; break }
      }
    }
    if (total > 0) {
      return [{ nome: `__TOTAL__${cidade}`, cpf: undefined, cidade, funcao: 'Motorista' as Funcao, salarioBase: total, totalReceber: total, jaExiste: true }]
    }
    return []
  }

  return extraidos.map(e => ({
    nome: e.nome.trim(),
    cpf: e.cpf,
    cidade,
    funcao: 'Motorista' as Funcao,
    salarioBase: e.valor,
    totalReceber: e.valor,
    banco: e.banco ? normalizarBanco(e.banco) : undefined,
    jaExiste: false,
  }))
}

// ── Aba TOTAL GERAL DA FOLHA ──────────────────────────────────────────────
function extrairTotalGeral(wb: any): { total: number; porCidade: Record<string, number> } {
  const nomeAba = wb.SheetNames.find((n: string) => n.toUpperCase().includes('TOTAL GERAL'))
  if (!nomeAba) return { total: 0, porCidade: {} }
  const ws = wb.Sheets[nomeAba]
  const dados: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  let total = 0
  const porCidade: Record<string, number> = {}
  for (const row of dados) {
    const vals = (row || []).filter((v: any) => v !== null)
    if (vals.length >= 3 && typeof vals[0] === 'number' && vals[0] >= 1 && vals[0] <= 20) {
      const cidade = String(vals[1] || '')
      const valor = typeof vals[2] === 'number' ? vals[2] : 0
      if (cidade && valor > 0) { porCidade[cidade] = valor; total += valor }
    }
    if (vals.length >= 2) {
      const ultimo = vals[vals.length - 1]
      const penultimo = String(vals[vals.length - 2] || '').toUpperCase()
      if (penultimo.includes('TOTAL') && typeof ultimo === 'number' && ultimo > 100000) total = ultimo
    }
  }
  return { total, porCidade }
}

// ── Componente principal ───────────────────────────────────────────────────
export default function DepartamentoPessoal() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('resumo')
  const [processando, setProcessando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [importando, setImportando] = useState(false)
  const [erroImport, setErroImport] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const processarExcel = async (arquivo: File, mesAnoOverride?: string) => {
    setProcessando(true)
    setErroImport(null)
    setResultado(null)
    try {
      const buf = await arquivo.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const colaboradores: ColaboradorImportado[] = []
      const erros: string[] = []

      const nomeArq = arquivo.name
      const matchMes = nomeArq.match(/^(\d{2})[_\-]/)
      const matchAno = nomeArq.match(/(20\d{2})/)
      const mes = matchMes ? parseInt(matchMes[1]) : new Date().getMonth() + 1
      const anoArq = matchAno ? parseInt(matchAno[1]) : new Date().getFullYear()
      const mesValido = mes >= 1 && mes <= 12 ? mes : new Date().getMonth() + 1
      const anoValido = anoArq >= 2020 && anoArq <= 2030 ? anoArq : new Date().getFullYear()
      const mesAno = mesAnoOverride || `${anoValido}-${String(mesValido).padStart(2, '0')}`

      const { total: totalReal } = extrairTotalGeral(wb)

      for (const nomeAba of wb.SheetNames) {
        const chave = nomeAba.trim().toUpperCase()
        const cidade = MAPA_CIDADES[chave]
        if (!cidade) {
          if (!chave.includes('TOTAL GERAL') && !chave.includes('MODELO')) {
            erros.push(`Aba "${nomeAba}" não reconhecida`)
          }
          continue
        }
        const ws = wb.Sheets[nomeAba]
        const dadosAba: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
        const colabs = parsearAba(dadosAba, cidade, chave)
        if (colabs.length === 0) erros.push(`Aba "${nomeAba}" — nenhum colaborador extraído`)
        colaboradores.push(...colabs)
      }

      // Marcar existentes
      const res = await fetch('/api/dp/colaboradores')
      const cadastrados: Colaborador[] = await res.json()
      const semInternos = colaboradores.filter(c => !c.nome.startsWith('__TOTAL__'))
      const comStatus = semInternos.map(c => {
        const existente = cadastrados.find(cad =>
          cad.nome.toLowerCase().trim() === c.nome.toLowerCase().trim()
        )
        return { ...c, jaExiste: !!existente, colaboradorId: existente?.id }
      })

      const totalFolha = colaboradores.reduce((s, c) => s + c.totalReceber, 0)
      const totalPorCidade: Record<string, number> = {}
      const valorPorColaborador: Record<string, number> = {}

      for (const c of colaboradores) {
        totalPorCidade[c.cidade] = (totalPorCidade[c.cidade] || 0) + c.totalReceber
      }
      for (const c of comStatus) {
        valorPorColaborador[c.nome.trim().toUpperCase()] = c.totalReceber
      }

      const nomeUpper = nomeArq.toUpperCase()
      const tipoFolha: 'antecipacao' | 'folha' = nomeUpper.includes('ANTECIP') ? 'antecipacao' : 'folha'

      setResultado({ colaboradores: comStatus, mesAno, totalFolha, totalReal, totalPorCidade, valorPorColaborador, nomeArquivo: nomeArq, tipoFolha, erros, avisos: [] })
    } catch (e: any) {
      setErroImport('Erro ao processar: ' + e.message)
    } finally {
      setProcessando(false)
    }
  }

  const confirmarImportacao = async () => {
    if (!resultado) return
    setImportando(true)
    const novos = resultado.colaboradores.filter(c => !c.jaExiste)
    const agora = new Date().toISOString()

    await fetch('/api/dp/fechamentos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `fech_${resultado.mesAno}_${resultado.tipoFolha}`,
        mesAno: resultado.mesAno,
        tipo: resultado.tipoFolha,
        arquivo: resultado.nomeArquivo,
        totalGeral: resultado.totalFolha,
        totalPorCidade: resultado.totalPorCidade,
        valorPorColaborador: resultado.valorPorColaborador,
        totalColaboradores: resultado.colaboradores.length,
        dataImport: agora,
      }),
    })

    const [anoFech, mesFech] = resultado.mesAno.split('-').map(Number)
    const diaPag = resultado.tipoFolha === 'antecipacao' ? 20 : 10
    const mesPagNum = resultado.tipoFolha === 'folha' ? (mesFech === 12 ? 1 : mesFech + 1) : mesFech
    const anoPagNum = resultado.tipoFolha === 'folha' && mesFech === 12 ? anoFech + 1 : anoFech
    const dataPagStr = `${String(diaPag).padStart(2, '0')}/${String(mesPagNum).padStart(2, '0')}/${anoPagNum}`

    for (const [cidadeStr, valorCidade] of Object.entries(resultado.totalPorCidade)) {
      if (valorCidade > 0) {
        await fetch('/api/dp/pagamentos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: `pag_${resultado.mesAno}_${resultado.tipoFolha}_${cidadeStr.replace(/\s+/g, '_')}`,
            mesAno: resultado.mesAno, cidade: cidadeStr, tipo: resultado.tipoFolha,
            valor: valorCidade, dataPagamento: dataPagStr, createdAt: agora,
          }),
        })
      }
    }

    for (const c of novos) {
      const colab: Colaborador = {
        id: `colab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        nome: c.nome, cpf: c.cpf, cidade: c.cidade, funcao: c.funcao,
        salarioBase: c.salarioBase, dataInicio: '', status: 'ativo',
        dadosBancarios: { banco: c.banco || '', agencia: c.agencia, conta: c.conta, pix: c.pix },
        observacoes: c.observacoes, createdAt: agora, updatedAt: agora,
      }
      await fetch('/api/dp/colaboradores', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(colab),
      })
    }

    setResultado(null)
    setImportando(false)
    setReload(r => r + 1)
    setAbaAtiva(novos.length > 0 ? 'colaboradores' : 'resumo')
  }

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const abas: { id: Aba; label: string; icon: string }[] = [
    { id: 'resumo',        label: 'Resumo',                 icon: '📊' },
    { id: 'pagamentos',    label: 'Controle de Pagamentos', icon: '💰' },
    { id: 'colaboradores', label: 'Colaboradores',          icon: '👥' },
  ]

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <img src="/logo.png" alt="ETCO Tur" className="logo-img" />
            <div className="logo-divider" />
            <div className="logo-text">
              <div className="logo-title">Departamento Pessoal</div>
              <div className="logo-sub">Gestão de colaboradores</div>
            </div>
          </div>
          <div className="logo-nome-cursivo">ETCO Tur</div>
          <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/" style={{ padding: '0.45rem 1rem', fontSize: 12, fontWeight: 700, background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>← Início</Link>
            <Link href="/dashboard" style={{ padding: '0.45rem 1rem', fontSize: 12, fontWeight: 700, background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>⛽ Combustível</Link>
            <div className={`upload-area ${processando ? 'upload-processando' : ''}`} onClick={() => !processando && inputRef.current?.click()} style={{ cursor: processando ? 'not-allowed' : 'pointer' }}>
              <input ref={inputRef} type="file" accept=".xlsx,.xls" hidden onChange={e => { const f = e.target.files?.[0]; if (f) { processarExcel(f); e.target.value = '' } }} />
              <span className="upload-texto">
                {processando ? <><span className="spinner" /> Processando...</> : <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  Importar folha Excel
                </>}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="main">
        <div className="abas" style={{ marginBottom: '1.25rem' }}>
          {abas.map(aba => (
            <button key={aba.id} className={`aba ${abaAtiva === aba.id ? 'aba-ativa' : ''}`} onClick={() => setAbaAtiva(aba.id)}>
              {aba.icon} {aba.label}
            </button>
          ))}
        </div>

        {erroImport && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '0.875rem 1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#dc2626' }}>⚠️ {erroImport}</span>
            <button onClick={() => setErroImport(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}>✕</button>
          </div>
        )}

        {resultado && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <div style={{ background: 'white', borderRadius: 16, padding: '2rem', maxWidth: 820, width: '100%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)' }}>📊 Prévia da importação</div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
                    {resultado.colaboradores.length} colaboradores · {resultado.colaboradores.filter(c => !c.jaExiste).length} novos · {resultado.colaboradores.filter(c => c.jaExiste).length} já cadastrados
                  </div>
                </div>
                <button onClick={() => setResultado(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-3)' }}>✕</button>
              </div>

              <div style={{ background: 'var(--sky-light)', border: '1px solid var(--sky-mid)', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1.25rem', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy)' }}>📅 Confirme antes de salvar:</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>Competência:</label>
                  <select
                    value={resultado.mesAno}
                    onChange={e => setResultado(r => r ? { ...r, mesAno: e.target.value } : r)}
                    style={{ padding: '0.3rem 0.6rem', fontSize: 12, fontWeight: 700, borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit', background: 'white', color: 'var(--navy)' }}
                  >
                    {Array.from({ length: 24 }, (_, i) => {
                      const d = new Date()
                      d.setMonth(d.getMonth() - i)
                      const ma = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                      const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
                      return <option key={ma} value={ma}>{nomes[d.getMonth()]}/{d.getFullYear()}</option>
                    })}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>Tipo:</label>
                  <select
                    value={resultado.tipoFolha}
                    onChange={e => setResultado(r => r ? { ...r, tipoFolha: e.target.value as 'antecipacao' | 'folha' } : r)}
                    style={{ padding: '0.3rem 0.6rem', fontSize: 12, fontWeight: 700, borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit', background: 'white', color: 'var(--navy)' }}
                  >
                    <option value="antecipacao">📅 Antecipação (dia 20)</option>
                    <option value="folha">💰 Folha (dia 10)</option>
                  </select>
                </div>
              </div>

              {(() => {
                const diff = resultado.totalFolha - resultado.totalReal
                const difpct = resultado.totalReal > 0 ? Math.abs(diff / resultado.totalReal * 100).toFixed(1) : '0'
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: '1.25rem' }}>
                    <div style={{ background: 'var(--navy)', borderRadius: 10, padding: '0.875rem', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600, textTransform: 'uppercase' as const }}>💰 Total a pagar</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'white' }}>{fmt(resultado.totalFolha)}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>soma dos recibos</div>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10, padding: '0.875rem', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase' as const }}>📋 Total geral folha</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-2)' }}>{fmt(resultado.totalReal)}</div>
                      <div style={{ fontSize: 10, color: diff > 0 ? '#d97706' : '#16a34a', marginTop: 2 }}>
                        {diff > 0 ? `+${fmt(diff)} (${difpct}% acima)` : diff < -1 ? `${fmt(diff)} (${difpct}% abaixo)` : '✓ valores idênticos'}
                      </div>
                    </div>
                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '0.875rem', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase' as const }}>Novos</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a' }}>{resultado.colaboradores.filter(c => !c.jaExiste).length}</div>
                    </div>
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '0.875rem', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase' as const }}>Já cadastrados</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#d97706' }}>{resultado.colaboradores.filter(c => c.jaExiste).length}</div>
                    </div>
                  </div>
                )
              })()}

              {resultado.erros.length > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>⚠️ Avisos</div>
                  {resultado.erros.map((e, i) => <div key={i} style={{ fontSize: 12, color: '#92400e' }}>• {e}</div>)}
                </div>
              )}

              <table className="tabela tabela-sm" style={{ marginBottom: '1.25rem' }}>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Cidade</th>
                    <th>Banco / Conta</th>
                    <th style={{ textAlign: 'right' }}>A receber</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.colaboradores.map((c, i) => (
                    <tr key={i} style={{ background: c.jaExiste ? '#fffbeb' : undefined }}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 12 }}>{c.nome}</div>
                        {c.observacoes && <div style={{ fontSize: 10, color: 'var(--amber)' }}>📌 {c.observacoes}</div>}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-2)' }}>{c.cidade}</td>
                      <td style={{ fontSize: 11 }}>
                        {c.banco && <div>{c.banco}</div>}
                        {c.agencia && <div style={{ color: 'var(--text-3)' }}>Ag {c.agencia}{c.conta ? ` · C ${c.conta}` : ''}</div>}
                        {c.pix && <div style={{ color: 'var(--text-3)' }}>PIX: {c.pix}</div>}
                        {!c.banco && !c.pix && '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(c.totalReceber)}</td>
                      <td>
                        {c.jaExiste
                          ? <span style={{ fontSize: 10, background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', borderRadius: 10, padding: '2px 7px', fontWeight: 600 }}>Já cadastrado</span>
                          : <span style={{ fontSize: 10, background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: 10, padding: '2px 7px', fontWeight: 600 }}>Novo</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: '1.25rem' }}>
                ℹ️ Apenas os <strong>novos</strong> colaboradores serão cadastrados. Após importar, revise e complete os dados de cada um.
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setResultado(null)} style={{ padding: '0.55rem 1.1rem', fontSize: 13, background: 'white', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                <button
                  onClick={confirmarImportacao}
                  disabled={importando}
                  style={{ padding: '0.55rem 1.25rem', fontSize: 13, fontWeight: 700, background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', opacity: importando ? 0.6 : 1 }}
                >
                  {importando ? 'Salvando...' : resultado.colaboradores.filter(c => !c.jaExiste).length > 0
                    ? `Importar ${resultado.colaboradores.filter(c => !c.jaExiste).length} colaboradores`
                    : 'Salvar fechamento'}
                </button>
              </div>
            </div>
          </div>
        )}

        {abaAtiva === 'resumo'        && <ResumoDPGeral key={reload} />}
        {abaAtiva === 'pagamentos'    && <ControlePagamentos key={reload} />}
        {abaAtiva === 'colaboradores' && <CadastroColaboradores key={reload} />}
      </main>
    </div>
  )
}
