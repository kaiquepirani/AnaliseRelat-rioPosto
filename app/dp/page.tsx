'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import CadastroColaboradores from '@/components/dp/CadastroColaboradores'
import ControlePagamentos from '@/components/dp/ControlePagamentos'
import { Colaborador, Cidade, Funcao } from '@/lib/dp-types'

type Aba = 'pagamentos' | 'colaboradores'

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
  'ITAPIRA (SAÚDE)':    'Itapira (Saúde)',
  'ITAPIRA (SAUDE)':    'Itapira (Saúde)',
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
  totalReal: number   // da aba TOTAL GERAL da planilha
  erros: string[]
  avisos: string[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extrairCPF(texto: string): string | undefined {
  const m = texto.match(/\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\.\s]?\d{2}/)
  return m ? m[0].replace(/\s/g, '') : undefined
}

function extrairFuncao(texto: string): Funcao {
  const t = texto.toUpperCase()
  if (t.includes('MONITOR')) return 'Monitor(a)'
  if (t.includes('MECÂNIC') || t.includes('MECANICO')) return 'Mecânico'
  if (t.includes('CONTADOR') || t.includes('CONTABIL')) return 'Administrativo'
  if (t.includes('ADMINISTR')) return 'Administrativo'
  return 'Motorista'
}

function extrairObservacoes(linhas: string[]): string {
  const obs: string[] = []
  const texto = linhas.join(' ').toUpperCase()
  if (texto.includes('GRÁVIDA') || texto.includes('GRAVIDA')) obs.push('Grávida')
  if (texto.includes('APOSENTADO')) obs.push('Aposentado')
  if (texto.includes('LICENÇA MATERNIDADE')) obs.push('Licença maternidade')
  if (texto.includes('CARGO DE CONFIANÇA') || texto.includes('CARGO CONFIANÇA')) obs.push('Cargo de confiança')
  if (texto.includes('ENCARREGADO')) obs.push('Encarregado')
  if (texto.includes('MECÂNICO') || texto.includes('MECANICO')) obs.push('Mecânico')
  return obs.join(', ')
}

const BANCOS_CONHECIDOS = [
  'NUBANK', 'NU PAGAMENTOS', 'ITAÚ', 'ITAU', 'CAIXA ECONÔMICA', 'CAIXA',
  'BRADESCO', 'SANTANDER', 'BANCO DO BRASIL', 'INTER', 'SICOOB', 'C6',
]

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

function extrairDadosBancarios(linhas: string[]) {
  let banco = '', agencia = '', conta = '', pix = ''
  const textoTotal = linhas.join(' ').toUpperCase()

  for (const b of BANCOS_CONHECIDOS) {
    if (textoTotal.includes(b.toUpperCase())) {
      banco = normalizarBanco(b); break
    }
  }

  const mAg = textoTotal.match(/AG(?:ÊNCIA|ENCIA|:|\.)?\s*[:\-]?\s*(\d{3,6})/i)
  if (mAg) agencia = mAg[1]

  const mConta = textoTotal.match(/(?:CONTA|C\/C|CC)\s*[:\-]?\s*([0-9\s\-]+(?:-\d)?)/i)
  if (mConta) conta = mConta[1].trim().replace(/\s+/g, '')

  for (const linha of linhas) {
    const mPix = linha.match(/(?:PIX|CHAVE\s*PIX)[:\s]+(.+)/i)
    if (mPix) { pix = mPix[1].trim(); break }
  }

  return { banco, agencia, conta, pix }
}

// ── Parser para abas padrão (com RESUMO PAGAMENTO) ─────────────────────────

function parsearAbaResumo(dados: any[][], cidade: Cidade): ColaboradorImportado[] {
  const colaboradores: ColaboradorImportado[] = []

  // Localiza RESUMO PAGAMENTO
  let resumoLinha = -1, resumoCol = -1
  for (let i = 0; i < dados.length; i++) {
    for (let j = 0; j < (dados[i]?.length || 0); j++) {
      if (String(dados[i][j] ?? '').toUpperCase().includes('RESUMO PAGAMENTO')) {
        resumoLinha = i; resumoCol = j; break
      }
    }
    if (resumoLinha >= 0) break
  }

  // Mapa nome→valor do resumo (usa índices numéricos)
  const resumoMap: Record<string, number> = {}
  if (resumoLinha >= 0) {
    for (let i = resumoLinha + 1; i < Math.min(resumoLinha + 100, dados.length); i++) {
      const row = dados[i] || []
      const idx = row[resumoCol]
      const nomeCel = row[resumoCol + 1]
      const valCel = row[resumoCol + 2]
      if (typeof idx === 'number' && idx >= 1 && idx <= 200) {
        const nome = String(nomeCel ?? '').trim()
        const valor = typeof valCel === 'number' ? valCel : 0
        if (nome.length > 2 && valor > 0) {
          resumoMap[nome.toUpperCase()] = valor
        }
      }
      if (String(nomeCel ?? '').toUpperCase().includes('TOTAL') &&
          !String(nomeCel ?? '').toUpperCase().includes('RESUMO')) break
    }
  }

  // Divide em blocos por colaborador (linha de ___)
  const blocos: string[][] = []
  let blocoAtual: string[] = []

  for (const row of dados) {
    const texto = (row || []).map((c: any) => String(c ?? '').trim()).filter(Boolean).join('\t')
    if (texto.includes('___') || texto.includes('---')) {
      if (blocoAtual.length > 2) blocos.push([...blocoAtual])
      blocoAtual = []
    } else if (texto) {
      blocoAtual.push(texto)
    }
  }
  if (blocoAtual.length > 2) blocos.push(blocoAtual)

  for (const bloco of blocos) {
    const textoBloco = bloco.join(' ')
    if (textoBloco.toUpperCase().includes('CNPJ') &&
        !textoBloco.toUpperCase().includes('TOTAL A RECEBER')) continue
    if (bloco.length < 3) continue

    // Nome: primeira linha antes de TAB ou "NOVO VALOR"
    const nomeLinha = bloco.find(l => {
      const t = l.toUpperCase()
      return l.length > 3 && !t.includes('PERIODO') && !t.includes('RECIBO') &&
        !t.includes('DECLARAMOS') && !t.includes('CNPJ') && !t.includes('REAJUSTE') &&
        !/^\d/.test(l.trim())
    })
    if (!nomeLinha) continue
    const nome = nomeLinha.split(/\t|NOVO VALOR|VALOR SALARIO/i)[0].trim()
    if (!nome || nome.length < 3) continue

    // Total a receber no bloco
    let totalReceber = 0
    const mTotal = textoBloco.match(/TOTAL A RECEBER\s*[\t\s]+([\d\.,]+)/i)
    if (mTotal) totalReceber = parseFloat(mTotal[1].replace(/\./g, '').replace(',', '.')) || 0

    // Fallback: busca no resumo pelo nome
    if (!totalReceber) {
      const nomeUp = nome.toUpperCase()
      for (const [key, val] of Object.entries(resumoMap)) {
        if (key.includes(nomeUp) || nomeUp.includes(key)) {
          totalReceber = val; break
        }
      }
    }

    // Ignora valores absurdos (CPF sendo capturado como valor)
    if (totalReceber > 50000) continue
    if (!totalReceber) continue // ignora R$0

    // Salário base — limita a valores razoáveis (R$500 a R$30.000)
    let salarioBase = 0
    const mSal = textoBloco.match(/(?:NOVO VALOR |VALOR )?SALARIO[^R\d]*R?\$?\s*([\d\.,]+)/i)
    if (mSal) {
      const val = parseFloat(mSal[1].replace(/\./g, '').replace(',', '.')) || 0
      if (val >= 500 && val <= 30000) salarioBase = val
    }
    if (!salarioBase) salarioBase = totalReceber

    const cpf = extrairCPF(textoBloco)
    const funcao = extrairFuncao(textoBloco)
    const { banco, agencia, conta, pix } = extrairDadosBancarios(bloco)
    const observacoes = extrairObservacoes(bloco)

    colaboradores.push({
      nome, cpf, cidade, funcao,
      salarioBase,
      totalReceber,
      banco: banco || undefined,
      agencia: agencia || undefined,
      conta: conta || undefined,
      pix: pix || undefined,
      observacoes: observacoes || undefined,
      jaExiste: false,
    })
  }

  // Fallback: se não extraiu nada pelos blocos, usa só o resumo
  if (colaboradores.length === 0) {
    for (const [nome, valor] of Object.entries(resumoMap)) {
      if (valor > 0) {
        colaboradores.push({
          nome, cidade, funcao: 'Motorista',
          salarioBase: valor, totalReceber: valor,
          observacoes: 'Revisar dados bancários',
          jaExiste: false,
        })
      }
    }
  }

  return colaboradores
}

// ── Parser especial para Ubatuba (formato diferente, sem RESUMO PAGAMENTO) ──

function parsearAbaUbatuba(dados: any[][], cidade: Cidade): ColaboradorImportado[] {
  const colaboradores: ColaboradorImportado[] = []

  // Ubatuba: resumo na coluna 7 (idx), 8 (nome apelido), 9 (n_diarias), 10 (valor)
  // Mas os nomes completos estão nos blocos individuais
  // Estratégia: extrai do resumo e cruza com blocos para pegar nome completo + CPF + banco

  // 1. Resumo à direita
  const resumoMap: Record<number, { nome: string; valor: number }> = {}
  for (let i = 0; i < dados.length; i++) {
    const row = dados[i] || []
    const idx = row[7]
    const nome = row[8]
    const valor = row[10]
    if (typeof idx === 'number' && idx >= 1 && idx <= 100 &&
        typeof nome === 'string' && nome.trim().length > 1 &&
        typeof valor === 'number' && valor > 0) {
      resumoMap[idx] = { nome: nome.trim(), valor }
    }
  }

  // 2. Blocos individuais para nome completo + CPF + banco
  const blocos: string[][] = []
  let blocoAtual: string[] = []
  for (const row of dados) {
    const texto = (row || []).map((c: any) => String(c ?? '').trim()).filter(Boolean).join('\t')
    if (texto.includes('___')) {
      if (blocoAtual.length > 2) blocos.push([...blocoAtual])
      blocoAtual = []
    } else if (texto) blocoAtual.push(texto)
  }
  if (blocoAtual.length > 2) blocos.push(blocoAtual)

  // Mapa: apelido → dados completos
  const dadosCompletos: Record<string, { nomeCompleto: string; cpf?: string; banco: string; agencia: string; conta: string; pix: string; observacoes: string }> = {}
  for (const bloco of blocos) {
    const textoBloco = bloco.join(' ')
    if (bloco.length < 2) continue

    const nomeLinha = bloco.find(l =>
      l.length > 3 && !l.toUpperCase().includes('CNPJ') &&
      !l.toUpperCase().includes('DECLARO') && !l.toUpperCase().includes('HORA EXTRA')
    )
    if (!nomeLinha) continue
    const nome = nomeLinha.split('\t')[0].trim()
    if (nome.length < 3) continue

    const cpf = extrairCPF(textoBloco)
    const { banco, agencia, conta, pix } = extrairDadosBancarios(bloco)
    const obs = extrairObservacoes(bloco)

    // Guarda pelo primeiro nome (apelido) para cruzar com resumo
    const primeiroNome = nome.split(' ')[0].toUpperCase()
    dadosCompletos[primeiroNome] = { nomeCompleto: nome, cpf, banco, agencia, conta, pix, observacoes: obs }
  }

  // 3. Combina resumo com dados completos
  for (const { nome: apelido, valor } of Object.values(resumoMap)) {
    const primeiroNome = apelido.split(' ')[0].toUpperCase()
    const dados = dadosCompletos[primeiroNome]

    colaboradores.push({
      nome: dados?.nomeCompleto || apelido,
      cpf: dados?.cpf,
      cidade,
      funcao: extrairFuncao(dados?.observacoes || ''),
      salarioBase: valor,
      totalReceber: valor,
      banco: dados?.banco || undefined,
      agencia: dados?.agencia || undefined,
      conta: dados?.conta || undefined,
      pix: dados?.pix || undefined,
      observacoes: (dados?.observacoes ? dados.observacoes + ' · ' : '') + 'Revisar nome e valores',
      jaExiste: false,
    })
  }

  return colaboradores
}

// ── Extrai total geral da aba TOTAL GERAL DA FOLHA ────────────────────────

function extrairTotalGeral(wb: any): { total: number; porCidade: Record<string, number> } {
  const nomeAba = wb.SheetNames.find((n: string) =>
    n.toUpperCase().includes('TOTAL GERAL')
  )
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
      if (cidade && valor > 0) {
        porCidade[cidade] = valor
        total += valor
      }
    }
    // Linha de TOTAL
    if (vals.length >= 2) {
      const ultimo = vals[vals.length - 1]
      const penultimo = String(vals[vals.length - 2] || '').toUpperCase()
      if (penultimo.includes('TOTAL') && typeof ultimo === 'number' && ultimo > 100000) {
        total = ultimo
      }
    }
  }

  return { total, porCidade }
}

// ── Componente principal ──────────────────────────────────────────────────

export default function DepartamentoPessoal() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('pagamentos')
  const [processando, setProcessando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [importando, setImportando] = useState(false)
  const [erroImport, setErroImport] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const processarExcel = async (arquivo: File) => {
    setProcessando(true)
    setErroImport(null)
    setResultado(null)

    try {
      const buf = await arquivo.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })

      const colaboradores: ColaboradorImportado[] = []
      const erros: string[] = []
      const avisos: string[] = []

      // Mês/ano pelo nome do arquivo
      const nomeArq = arquivo.name
      const matchMes = nomeArq.match(/^(\d{2})_/)
      const mes = matchMes ? parseInt(matchMes[1]) : new Date().getMonth() + 1
      const ano = new Date().getFullYear()
      const mesAno = `${ano}-${String(mes).padStart(2, '0')}`

      // Extrai total geral real da planilha para comparação
      const { total: totalReal, porCidade: totaisReais } = extrairTotalGeral(wb)

      for (const nomeAba of wb.SheetNames) {
        const chave = nomeAba.trim().toUpperCase()
        const cidade = MAPA_CIDADES[chave]

        if (!cidade) {
          if (!['TOTAL GERAL DA FOLHA', 'TOTAL GERAL'].includes(chave)) {
            erros.push(`Aba "${nomeAba}" não reconhecida — ignorada`)
          }
          continue
        }

        const ws = wb.Sheets[nomeAba]
        const dados: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

        let colabs: ColaboradorImportado[]

        // Ubatuba tem formato especial
        if (chave === 'UBATUBA') {
          colabs = parsearAbaUbatuba(dados, cidade)
          avisos.push(`Ubatuba: formato especial — verifique nomes e valores após importar`)
        } else {
          colabs = parsearAbaResumo(dados, cidade)
        }

        if (colabs.length === 0) {
          erros.push(`Aba "${nomeAba}" — nenhum colaborador extraído`)
        } else {
          // Compara total calculado vs total real da planilha
          const totalCalc = colabs.reduce((s, c) => s + c.totalReceber, 0)
          const cidadeKey = Object.keys(totaisReais).find(k =>
            k.toUpperCase().includes(chave.split('(')[0].trim()) ||
            chave.includes(k.toUpperCase().split('(')[0].trim())
          )
          if (cidadeKey && totaisReais[cidadeKey]) {
            const diff = Math.abs(totalCalc - totaisReais[cidadeKey])
            if (diff > 1) {
              avisos.push(`${nomeAba}: calculado R$${totalCalc.toFixed(2)} vs planilha R$${totaisReais[cidadeKey].toFixed(2)} (diff R$${diff.toFixed(2)})`)
            }
          }
        }

        colaboradores.push(...colabs)
      }

      // Marca duplicatas
      const res = await fetch('/api/dp/colaboradores')
      const cadastrados: Colaborador[] = await res.json()

      const comStatus = colaboradores.map(c => {
        const existente = cadastrados.find(
          cad => cad.nome.toLowerCase().trim() === c.nome.toLowerCase().trim()
        )
        return { ...c, jaExiste: !!existente, colaboradorId: existente?.id }
      })

      const totalFolha = comStatus.reduce((s, c) => s + c.totalReceber, 0)

      setResultado({ colaboradores: comStatus, mesAno, totalFolha, totalReal, erros, avisos })
    } catch (e: any) {
      setErroImport('Erro ao processar o arquivo: ' + e.message)
    } finally {
      setProcessando(false)
    }
  }

  const confirmarImportacao = async () => {
    if (!resultado) return
    setImportando(true)
    const novos = resultado.colaboradores.filter(c => !c.jaExiste)
    const agora = new Date().toISOString()

    for (const c of novos) {
      const colab: Colaborador = {
        id: `colab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        nome: c.nome, cpf: c.cpf, cidade: c.cidade, funcao: c.funcao,
        salarioBase: c.salarioBase, dataInicio: '', status: 'ativo',
        dadosBancarios: { banco: c.banco || '', agencia: c.agencia, conta: c.conta, pix: c.pix },
        observacoes: c.observacoes,
        createdAt: agora, updatedAt: agora,
      }
      await fetch('/api/dp/colaboradores', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(colab),
      })
    }

    setResultado(null)
    setImportando(false)
    setReload(r => r + 1)
    setAbaAtiva('colaboradores')
  }

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const abas: { id: Aba; label: string; icon: string }[] = [
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
                {processando ? <><span className="spinner" /> Processando folha...</> : <>
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

        {/* Modal de prévia */}
        {resultado && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <div style={{ background: 'white', borderRadius: 16, padding: '2rem', maxWidth: 820, width: '100%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)' }}>📊 Prévia da importação</div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
                    {resultado.colaboradores.length} colaboradores · {resultado.colaboradores.filter(c => !c.jaExiste).length} novos
                  </div>
                </div>
                <button onClick={() => setResultado(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-3)' }}>✕</button>
              </div>

              {/* Cards com comparação de totais */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: '1.25rem' }}>
                <div style={{ background: 'var(--sky-light)', borderRadius: 10, padding: '0.875rem', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase' as const }}>Total calculado</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy)' }}>{fmt(resultado.totalFolha)}</div>
                </div>
                <div style={{ background: resultado.totalReal > 0 && Math.abs(resultado.totalFolha - resultado.totalReal) < 10 ? '#f0fdf4' : '#fffbeb', border: `1px solid ${Math.abs(resultado.totalFolha - resultado.totalReal) < 10 ? '#86efac' : '#fde68a'}`, borderRadius: 10, padding: '0.875rem', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase' as const }}>Total da planilha</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: Math.abs(resultado.totalFolha - resultado.totalReal) < 10 ? '#16a34a' : '#d97706' }}>{fmt(resultado.totalReal)}</div>
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

              {/* Avisos */}
              {resultado.avisos.length > 0 && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1d4ed8', marginBottom: 4 }}>ℹ️ Avisos ({resultado.avisos.length})</div>
                  {resultado.avisos.map((e, i) => <div key={i} style={{ fontSize: 12, color: '#1d4ed8' }}>• {e}</div>)}
                </div>
              )}

              {/* Erros */}
              {resultado.erros.length > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>⚠️ Problemas ({resultado.erros.length})</div>
                  {resultado.erros.map((e, i) => <div key={i} style={{ fontSize: 12, color: '#92400e' }}>• {e}</div>)}
                </div>
              )}

              {/* Tabela */}
              <table className="tabela tabela-sm" style={{ marginBottom: '1.25rem' }}>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Cidade</th>
                    <th>CPF</th>
                    <th>Banco</th>
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
                      <td style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>{c.cpf || '—'}</td>
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
                <button onClick={confirmarImportacao}
                  disabled={importando || resultado.colaboradores.filter(c => !c.jaExiste).length === 0}
                  style={{ padding: '0.55rem 1.25rem', fontSize: 13, fontWeight: 700, background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', opacity: importando || resultado.colaboradores.filter(c => !c.jaExiste).length === 0 ? 0.6 : 1 }}>
                  {importando ? 'Importando...' : `Importar ${resultado.colaboradores.filter(c => !c.jaExiste).length} colaboradores`}
                </button>
              </div>
            </div>
          </div>
        )}

        {abaAtiva === 'pagamentos'    && <ControlePagamentos key={reload} />}
        {abaAtiva === 'colaboradores' && <CadastroColaboradores key={reload} />}
      </main>
    </div>
  )
}
