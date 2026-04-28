'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import CadastroColaboradores from '@/components/dp/CadastroColaboradores'
import ControlePagamentos from '@/components/dp/ControlePagamentos'
import ResumoDPGeral from '@/components/dp/ResumoDPGeral'
import DuplicatasModal from '@/components/dp/DuplicatasModal'
import { Colaborador, Cidade, Funcao } from '@/lib/dp-types'
import { parseFolhaPagamento } from '@/lib/parser-folha'
import { buscarMatch, LIMITE_AUTO_MERGE } from '@/lib/dedup-nomes'

type Aba = 'resumo' | 'pagamentos' | 'colaboradores'
type TipoFolha = 'antecipacao' | 'folha'

// =============================================================================
// MAPA DE ABAS — Nome da aba do XLSX (uppercased + trimmed) → tipo Cidade
// =============================================================================
const MAPA_CIDADES: Record<string, Cidade> = {
  'FOLHA AGUAS':       'Águas de Lindóia (Folha)',
  'ÁGUAS (FOLHA)':     'Águas de Lindóia (Folha)',
  'AGUAS (FOLHA)':     'Águas de Lindóia (Folha)',
  'DIÁRIAS ÁGUAS':     'Águas de Lindóia (Diárias)',
  'ÁGUAS (DIÁRIAS)':   'Águas de Lindóia (Diárias)',
  'AGUAS (DIARIAS)':   'Águas de Lindóia (Diárias)',
  'MORUNGABA':         'Morungaba',
  'MOGI MIRIM':        'Mogi Mirim',
  'ITAPIRA (ESCOLAR)': 'Itapira (Escolar)',
  'ESCOLAR ITAPIRA':   'Itapira (Escolar)',
  'ITAPIRA ESCOLAR':   'Itapira (Escolar)',
  'ITAPIRA (SAÚDE)':   'Itapira (Saúde)',
  'ITAPIRA (SAUDE)':   'Itapira (Saúde)',
  'ITAPIRA SAUDE':     'Itapira (Saúde)',
  'ITAPIRA SAÚDE':     'Itapira (Saúde)',
  'ITAPIRA':           'Itapira (Saúde)',
  'SAUDE ITAPIRA':     'Itapira (Saúde)',
  'AGUAÍ':             'Aguaí',
  'AGUAI':             'Aguaí',
  'CASA BRANCA':       'Casa Branca',
  'PINHAL':            'Pinhal',
  'UBATUBA':           'Ubatuba',
  'PORTO FERREIRA':    'Porto Ferreira',
  'LINDÓIA':           'Lindóia',
  'LINDOIA':           'Lindóia',
  'MOCOCA':            'Mococa',
  'RIO CLARO':         'Rio Claro',
}

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
  // ← NOVO: indica que esse colaborador foi auto-mesclado com nome similar
  autoMesclado?: { nomeOriginal: string; score: number }
}

interface ResultadoImportacao {
  colaboradores: ColaboradorImportado[]
  mesAno: string
  totalFolha: number
  totalReal: number
  totalPorCidade: Record<string, number>
  valorPorColaborador: Record<string, number>
  nomeArquivo: string
  tipoFolha: TipoFolha
  erros: string[]
  avisos: string[]
}

// =============================================================================
// HELPERS LOCAIS
// =============================================================================

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

function extrairDadosCadastrais(
  wb: XLSX.WorkBook,
): Map<string, { cpf?: string; banco?: string }> {
  const out = new Map<string, { cpf?: string; banco?: string }>()
  for (const nomeAba of wb.SheetNames) {
    const ws = wb.Sheets[nomeAba]
    const dados: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
    for (let i = 0; i < dados.length; i++) {
      const r = dados[i]
      if (!r) continue
      const c1 = String(r[1] ?? '').trim().toUpperCase().replace(/:$/, '').trim()
      if ((c1 === 'CPF' || c1 === 'CNPJ') && dados[i + 1]) {
        const nr = dados[i + 1]
        const cpf = String(nr[1] ?? '').trim()
        const nome = String(nr[3] ?? '').trim()
        const banco = String(nr[5] ?? '').trim()
        if (nome.length > 3) {
          const chave = nome.toUpperCase()
          if (!out.has(chave)) {
            out.set(chave, {
              cpf: cpf.length > 5 ? cpf : undefined,
              banco: banco || undefined,
            })
          }
        }
      }
    }
  }
  return out
}

function extrairTotalGeral(
  wb: XLSX.WorkBook,
): { total: number; porCidade: Record<string, number> } {
  const nomeAba = wb.SheetNames.find(n => n.toUpperCase().includes('TOTAL GERAL'))
  if (!nomeAba) return { total: 0, porCidade: {} }
  const ws = wb.Sheets[nomeAba]
  const dados: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  let total = 0
  const porCidade: Record<string, number> = {}
  for (const row of dados) {
    const vals = (row || []).filter((v: any) => v !== null)
    if (
      vals.length >= 3 &&
      typeof vals[0] === 'number' &&
      vals[0] >= 1 &&
      vals[0] <= 20
    ) {
      const cidade = String(vals[1] || '')
      const valor = typeof vals[2] === 'number' ? vals[2] : 0
      if (cidade && valor > 0) {
        porCidade[cidade] = valor
        total += valor
      }
    }
    if (vals.length >= 2) {
      const ultimo = vals[vals.length - 1]
      const penultimo = String(vals[vals.length - 2] || '').toUpperCase()
      if (
        penultimo.includes('TOTAL') &&
        typeof ultimo === 'number' &&
        ultimo > 100000
      ) {
        total = ultimo
      }
    }
  }
  return { total, porCidade }
}

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================
export default function DepartamentoPessoal() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('resumo')
  const [processando, setProcessando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [arquivoAtual, setArquivoAtual] = useState<File | null>(null)
  const [importando, setImportando] = useState(false)
  const [erroImport, setErroImport] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  // ← NOVO: modal de revisão de duplicatas
  const [mostrandoDuplicatas, setMostrandoDuplicatas] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const processarExcel = async (
    arquivo: File,
    mesAnoOverride?: string,
    tipoOverride?: TipoFolha,
  ) => {
    setProcessando(true)
    setErroImport(null)
    setArquivoAtual(arquivo)
    if (!tipoOverride) setResultado(null)

    try {
      const buf = await arquivo.arrayBuffer()

      const tipoFolha: TipoFolha =
        tipoOverride ||
        (arquivo.name.toUpperCase().includes('ANTECIP') ? 'antecipacao' : 'folha')

      const parsed = parseFolhaPagamento(buf, tipoFolha)
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const dadosCadastrais = extrairDadosCadastrais(wb)
      const { total: totalReal } = extrairTotalGeral(wb)

      // Cruza com colaboradores já cadastrados ANTES de criar a lista
      const res = await fetch('/api/dp/colaboradores')
      const cadastrados: Colaborador[] = await res.json()

      const colaboradores: ColaboradorImportado[] = []
      const erros: string[] = []
      const avisos: string[] = []

      for (const aba of parsed.abas) {
        const chave = aba.cidade.trim().toUpperCase()
        const cidade = MAPA_CIDADES[chave]
        if (!cidade) {
          erros.push(
            `Aba "${aba.cidade}" não reconhecida — ${aba.colaboradores.length} colaboradores ignorados`,
          )
          continue
        }
        for (const c of aba.colaboradores) {
          // ──────────────────────────────────────────────────────────
          // ★ DEDUP PREVENTIVO: busca match no cadastro existente
          // ──────────────────────────────────────────────────────────
          const match = buscarMatch(
            c.nome,
            cidade,
            cadastrados.map(cad => ({ nome: cad.nome, cidade: cad.cidade })),
          )

          let nomeFinal = c.nome
          let jaExiste = false
          let colaboradorId: string | undefined
          let autoMesclado: { nomeOriginal: string; score: number } | undefined

          if (match.tipo === 'identico') {
            // Match perfeito — usa o nome canônico do cadastro
            const ex = cadastrados.find(cad => cad.nome.trim().toUpperCase() === match.alvo.trim().toUpperCase())
            if (ex) {
              nomeFinal = ex.nome
              jaExiste = true
              colaboradorId = ex.id
            }
          } else if (match.tipo === 'auto_merge') {
            // Match com >=90% de confiança — funde automaticamente
            const ex = cadastrados.find(cad => cad.nome.trim().toUpperCase() === match.alvo.trim().toUpperCase())
            if (ex) {
              nomeFinal = ex.nome
              jaExiste = true
              colaboradorId = ex.id
              autoMesclado = { nomeOriginal: c.nome, score: match.score }
              avisos.push(
                `"${c.nome}" foi automaticamente mesclado com "${ex.nome}" (${(match.score * 100).toFixed(0)}% similar)`,
              )
            }
          }
          // 'revisar' e 'novo' → cadastra com nome próprio (revisar pelo modal depois)

          const cad = dadosCadastrais.get(c.nome.toUpperCase())
          colaboradores.push({
            nome: nomeFinal,
            cpf: cad?.cpf,
            cidade,
            funcao: 'Motorista',
            salarioBase: c.valor,
            totalReceber: c.valor,
            banco: cad?.banco ? normalizarBanco(cad.banco) : undefined,
            jaExiste,
            colaboradorId,
            autoMesclado,
          })
        }
      }

      // Detecta mês/ano pelo nome do arquivo
      const matchMes = arquivo.name.match(/^(\d{2})[_\-]/)
      const matchAno = arquivo.name.match(/(20\d{2})/)
      const mes = matchMes ? parseInt(matchMes[1]) : new Date().getMonth() + 1
      const anoArq = matchAno ? parseInt(matchAno[1]) : new Date().getFullYear()
      const mesValido = mes >= 1 && mes <= 12 ? mes : new Date().getMonth() + 1
      const anoValido =
        anoArq >= 2020 && anoArq <= 2030 ? anoArq : new Date().getFullYear()
      const mesAno =
        mesAnoOverride || `${anoValido}-${String(mesValido).padStart(2, '0')}`

      // Calcula totais
      const totalFolha = colaboradores.reduce((s, c) => s + c.totalReceber, 0)
      const totalPorCidade: Record<string, number> = {}
      for (const c of colaboradores) {
        totalPorCidade[c.cidade] = (totalPorCidade[c.cidade] || 0) + c.totalReceber
      }

      // valorPorColaborador — soma quando mesmo nome aparece mais de uma vez
      // (com auto-merge, nomes mesclados já compartilham a mesma chave)
      const valorPorColaborador: Record<string, number> = {}
      for (const c of colaboradores) {
        const chave = c.nome.trim().toUpperCase()
        valorPorColaborador[chave] = (valorPorColaborador[chave] ?? 0) + c.totalReceber
      }

      setResultado({
        colaboradores,
        mesAno,
        totalFolha,
        totalReal,
        totalPorCidade,
        valorPorColaborador,
        nomeArquivo: arquivo.name,
        tipoFolha,
        erros,
        avisos,
      })
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
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const mesPagNum =
      resultado.tipoFolha === 'folha' ? (mesFech === 12 ? 1 : mesFech + 1) : mesFech
    const anoPagNum =
      resultado.tipoFolha === 'folha' && mesFech === 12 ? anoFech + 1 : anoFech
    const dataPagStr = `${String(diaPag).padStart(2, '0')}/${String(mesPagNum).padStart(2, '0')}/${anoPagNum}`

    for (const [cidadeStr, valorCidade] of Object.entries(resultado.totalPorCidade)) {
      if (valorCidade > 0) {
        await fetch('/api/dp/pagamentos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: `pag_${resultado.mesAno}_${resultado.tipoFolha}_${cidadeStr.replace(/\s+/g, '_')}`,
            mesAno: resultado.mesAno,
            cidade: cidadeStr,
            tipo: resultado.tipoFolha,
            valor: valorCidade,
            dataPagamento: dataPagStr,
            createdAt: agora,
          }),
        })
      }
    }

    // Dedup interna na lista de novos antes de cadastrar
    // (caso o parser retorne 2 ocorrências do mesmo nome novo)
    const novosUnicos = new Map<string, ColaboradorImportado>()
    for (const c of novos) {
      const k = c.nome.trim().toUpperCase()
      if (!novosUnicos.has(k)) novosUnicos.set(k, c)
    }

    for (const c of Array.from(novosUnicos.values())) {
      const colab: Colaborador = {
        id: `colab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        nome: c.nome,
        cpf: c.cpf,
        cidade: c.cidade,
        funcao: c.funcao,
        salarioBase: c.salarioBase,
        dataInicio: '',
        status: 'ativo',
        dadosBancarios: {
          banco: c.banco || '',
          agencia: c.agencia,
          conta: c.conta,
          pix: c.pix,
        },
        observacoes: c.observacoes,
        createdAt: agora,
        updatedAt: agora,
      }
      await fetch('/api/dp/colaboradores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(colab),
      })
    }

    setResultado(null)
    setArquivoAtual(null)
    setImportando(false)
    setReload(r => r + 1)
    setAbaAtiva(novosUnicos.size > 0 ? 'colaboradores' : 'resumo')
  }

  const fmt = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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
        <div className="abas" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          {abas.map(aba => (
            <button key={aba.id} className={`aba ${abaAtiva === aba.id ? 'aba-ativa' : ''}`} onClick={() => setAbaAtiva(aba.id)}>
              {aba.icon} {aba.label}
            </button>
          ))}
          {/* ← NOVO: botão de revisar duplicatas */}
          <button
            onClick={() => setMostrandoDuplicatas(true)}
            title="Revisar colaboradores potencialmente duplicados"
            style={{
              marginLeft: 'auto',
              padding: '0.45rem 0.9rem',
              fontSize: 12,
              fontWeight: 700,
              background: 'white',
              color: '#2D3A6B',
              border: '1px solid #bfdbfe',
              borderRadius: 8,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            🔍 Revisar duplicatas
          </button>
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
                <button onClick={() => { setResultado(null); setArquivoAtual(null) }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-3)' }}>✕</button>
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
                    onChange={async e => {
                      const novoTipo = e.target.value as TipoFolha
                      if (arquivoAtual) {
                        await processarExcel(arquivoAtual, resultado.mesAno, novoTipo)
                      }
                    }}
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

              {/* ← NOVO: avisos de auto-merge (>=90% similar) */}
              {resultado.avisos.length > 0 && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 6 }}>
                    🔗 Mesclagens automáticas detectadas ({resultado.avisos.length})
                  </div>
                  {resultado.avisos.slice(0, 5).map((a, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#1e40af', marginBottom: 2 }}>• {a}</div>
                  ))}
                  {resultado.avisos.length > 5 && (
                    <div style={{ fontSize: 11, color: '#1e40af', fontStyle: 'italic' }}>
                      …e mais {resultado.avisos.length - 5}
                    </div>
                  )}
                </div>
              )}

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
                        {c.autoMesclado && (
                          <div style={{ fontSize: 10, color: '#1d4ed8', marginTop: 2 }}>
                            🔗 mesclado de &quot;{c.autoMesclado.nomeOriginal}&quot; ({(c.autoMesclado.score * 100).toFixed(0)}%)
                          </div>
                        )}
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
                        {c.autoMesclado
                          ? <span style={{ fontSize: 10, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 10, padding: '2px 7px', fontWeight: 600 }}>Mesclado</span>
                          : c.jaExiste
                            ? <span style={{ fontSize: 10, background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', borderRadius: 10, padding: '2px 7px', fontWeight: 600 }}>Já cadastrado</span>
                            : <span style={{ fontSize: 10, background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: 10, padding: '2px 7px', fontWeight: 600 }}>Novo</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: '1.25rem' }}>
                ℹ️ Apenas os <strong>novos</strong> colaboradores serão cadastrados. Após importar, revise possíveis duplicatas em <strong>🔍 Revisar duplicatas</strong>.
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setResultado(null); setArquivoAtual(null) }} style={{ padding: '0.55rem 1.1rem', fontSize: 13, background: 'white', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
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

        {/* Modal de revisar duplicatas */}
        {mostrandoDuplicatas && (
          <DuplicatasModal
            onClose={() => setMostrandoDuplicatas(false)}
            onUnificacaoFeita={() => { setReload(r => r + 1) }}
          />
        )}

        {abaAtiva === 'resumo'        && <ResumoDPGeral key={reload} />}
        {abaAtiva === 'pagamentos'    && <ControlePagamentos key={reload} />}
        {abaAtiva === 'colaboradores' && <CadastroColaboradores key={reload} />}
      </main>
    </div>
  )
}
