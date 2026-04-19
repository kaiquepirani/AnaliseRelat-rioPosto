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
  valorPorColaborador: Record<string, number>  // nome → valor a receber
  nomeArquivo: string
  tipoFolha: 'antecipacao' | 'folha'
  erros: string[]
  avisos: string[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extrairCPF(texto: string): string | undefined {
  const m = texto.match(/\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\.\s]?\d{2}/)
  if (!m) return undefined
  // Valida que é realmente um CPF (11 dígitos)
  const digits = m[0].replace(/\D/g, '')
  return digits.length === 11 ? m[0].replace(/\s/g, '') : undefined
}

function extrairFuncao(texto: string): Funcao {
  const t = texto.toUpperCase()
  if (t.includes('MONITOR')) return 'Monitor(a)'
  if (t.includes('MECÂNIC') || t.includes('MECANICO')) return 'Mecânico'
  if (t.includes('CONTADOR') || t.includes('CONTABIL')) return 'Administrativo'
  if (t.includes('ADMINISTR')) return 'Administrativo'
  return 'Motorista'
}

function extrairObservacoes(texto: string): string {
  const obs: string[] = []
  const t = texto.toUpperCase()
  if (t.includes('GRÁVIDA') || t.includes('GRAVIDA')) obs.push('Grávida')
  if (t.includes('APOSENTADO')) obs.push('Aposentado')
  if (t.includes('LICENÇA MATERNIDADE') || t.includes('LICENCA MATERNIDADE')) obs.push('Licença maternidade')
  if (t.includes('CARGO DE CONFIANÇA') || t.includes('CARGO CONFIANÇA')) obs.push('Cargo de confiança')
  if (t.includes('ENCARREGADO')) obs.push('Encarregado')
  return obs.join(', ')
}

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

function detectarBanco(texto: string): string {
  const t = texto.toUpperCase()
  const bancos = ['NUBANK', 'NU PAGAMENTOS', 'ITAÚ', 'ITAU', 'CAIXA ECONÔMICA', 'CAIXA',
    'BRADESCO', 'SANTANDER', 'BANCO DO BRASIL', 'INTER', 'SICOOB', 'C6']
  for (const b of bancos) {
    if (t.includes(b)) return normalizarBanco(b)
  }
  return ''
}

// ── Parser principal: usa RESUMO PAGAMENTO como âncora ─────────────────────
// Lê as colunas da ESQUERDA diretamente (col1=B=rótulo, col3=D=valor)
// para evitar contaminação do RESUMO PAGAMENTO que fica nas colunas da direita.
// Prioridade do salário base:
//   1. Linha com "SALARIO" em col1/col3 → primeiro R$X.XXX na linha
//   2. Antecipação/0.4 → fallback quando não há texto de salário
//   3. totalReceber → último fallback

function extrairRealBR(s: string): number {
  const t = (s || '').trim()
  if (!t) return 0
  if (t.includes(',')) return parseFloat(t.replace(/\./g, '').replace(',', '.')) || 0
  if (t.includes('.')) {
    const partes = t.split('.')
    return partes[partes.length - 1].length <= 2 ? parseFloat(t) : parseFloat(t.replace(/\./g, ''))
  }
  return parseFloat(t) || 0
}

function parsearAba(dados: any[][], cidade: Cidade): ColaboradorImportado[] {
  // ── Estratégia 1: RESUMO PAGAMENTO ───────────────────────────────────────
  // Procura "RESUMO PAGAMENTO" e usa a coluna seguinte como nome e a outra como valor
  let resumoLinha = -1, resumoCol = -1
  for (let i = 0; i < dados.length; i++) {
    const row = dados[i] || []
    for (let j = 0; j < row.length; j++) {
      if (String(row[j] ?? '').toUpperCase().includes('RESUMO PAGAMENTO')) {
        resumoLinha = i; resumoCol = j; break
      }
    }
    if (resumoLinha >= 0) break
  }

  if (resumoLinha >= 0) {
    // Detecta formato: col=índice+nome+valor (A) ou col=nome+valor (B)
    const listaResumo: { nome: string; valor: number }[] = []
    for (let i = resumoLinha + 1; i < Math.min(resumoLinha + 120, dados.length); i++) {
      const row = dados[i] || []
      const c0 = row[resumoCol]
      const c1 = row[resumoCol + 1]
      const c2 = row[resumoCol + 2]
      const c0s = String(c0 ?? '').trim()
      const c1s = String(c1 ?? '').trim()

      if (c0s.toUpperCase() === 'TOTAL' || c1s.toUpperCase() === 'TOTAL') break
      if (c0s.includes('#REF') || c1s.includes('#REF')) continue

      // Formato A: índice numérico + nome + valor
      if (typeof c0 === 'number' && c0 >= 1 && c0 <= 200 &&
          c1s.length > 2 && typeof c2 === 'number' && c2 > 0) {
        listaResumo.push({ nome: c1s, valor: c2 })
      }
      // Formato B: nome + valor (sem índice)
      else if (c0s.length > 3 && typeof c1 === 'number' && c1 > 0 &&
               !c0s.match(/^\d/) && !c0s.toUpperCase().includes('VALE') &&
               !c0s.toUpperCase().includes('RESUMO')) {
        listaResumo.push({ nome: c0s, valor: c1 })
      }
    }

    if (listaResumo.length > 0) {
      // Para cada colaborador do resumo, busca CPF e banco no bloco individual
      const resultado: ColaboradorImportado[] = []
      for (const { nome, valor } of listaResumo) {
        let cpf: string | undefined
        let banco = '', agencia = '', conta = '', pix = ''
        let observacoes = ''
        let funcao: Funcao = 'Motorista'

        // Busca bloco do colaborador: linha com nome em col0 (não assinatura)
        // Assinaturas ficam após ___ e têm apenas o nome sem outros dados
        const nomeUp = nome.toUpperCase().trim()
        const primNome = nomeUp.split(' ')[0]
        let blocoInicio = -1

        for (let i = 0; i < dados.length; i++) {
          const row = dados[i] || []
          const c0 = String(row[0] ?? '').trim().toUpperCase()
          const c1 = String(row[1] ?? '').trim().toUpperCase()

          // Nome precisa estar no início da célula e a linha precisa ter outros dados
          // (não é assinatura — assinatura tem apenas o nome e a linha anterior tem ___)
          const bateC0 = c0.length > 3 && (c0.startsWith(primNome) || nomeUp.startsWith(c0.split(' ')[0]))
          const bateC1 = c1.length > 3 && (c1.startsWith(primNome) || nomeUp.startsWith(c1.split(' ')[0]))
          if (!bateC0 && !bateC1) continue

          // Verificar se é assinatura (linha anterior tem ___ ou linha seguinte é vazia)
          const antTexto = String((dados[i-1] || []).join(' '))
          const proxTexto = String((dados[i+1] || []).join(' '))
          const ehAssinatura = antTexto.includes('___') ||
                               (proxTexto.trim() === '' && !row.some(v => typeof v === 'number'))
          if (ehAssinatura) continue

          // Linha tem dados úteis além do nome — é o início do bloco
          const temDados = row.some((v, j) => j > 0 && v !== null && v !== undefined)
          if (temDados || dados[i+1]?.some(v => v !== null)) {
            blocoInicio = i
            break
          }
        }

        if (blocoInicio >= 0) {
          // Delimitar fim do bloco (próximo ___ após início)
          let blocoFim = Math.min(blocoInicio + 35, dados.length)
          for (let j = blocoInicio + 3; j < blocoFim; j++) {
            if (String((dados[j] || []).join(' ')).includes('___')) { blocoFim = j; break }
          }

          for (let j = blocoInicio; j < blocoFim; j++) {
            const r = dados[j] || []
            const allText = r.map(v => String(v ?? '')).join(' ')
            const allUp = allText.toUpperCase()

            // CPF — apenas em linhas que não mencionam PIX/CHAVE
            if (!cpf && !allUp.includes('PIX') && !allUp.includes('CHAVE')) {
              const cpfM = allText.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/)
              if (cpfM) cpf = cpfM[0]
            }
            // Banco
            if (!banco) {
              for (const b of ['NUBANK','NU PAGAMENTOS','ITAÚ','ITAU','CAIXA','BRADESCO','SANTANDER','BANCO DO BRASIL','INTER','SICOOB']) {
                if (allUp.includes(b)) { banco = normalizarBanco(b); break }
              }
            }
            // Agência
            if (!agencia) {
              const agM = allText.match(/AG(?:ENCIA|ÊNCIA|\.|\s)*[:\-]?\s*(\d{3,6})/i)
              if (agM) agencia = agM[1]
            }
            // Conta
            if (!conta) {
              const ctM = allText.match(/(?:CONTA|C\/C)[:\s-]*([0-9][0-9\s-]{2,12})/i)
              if (ctM) conta = ctM[1].trim().replace(/\s+/g, '')
            }
            // PIX
            if (!pix) {
              const pxM = allText.match(/PIX[:\s]+([^\s,]+)/i)
              if (pxM) pix = pxM[1]
            }
          }
        }

        resultado.push({
          nome, cpf, cidade, funcao,
          salarioBase: valor, totalReceber: valor,
          banco: banco || undefined, agencia: agencia || undefined,
          conta: conta || undefined, pix: pix || undefined,
          observacoes: observacoes || undefined,
          jaExiste: false,
        })
      }
      return resultado
    }
  }

  // ── Estratégia 2: sem RESUMO → soma totais por aba ───────────────────────
  // Tentativas em ordem de prioridade

  // 2A: "Valor líquido" em qualquer coluna (Porto Ferreira)
  let totalAba = 0
  for (const row of dados) {
    for (let j = 0; j < (row || []).length; j++) {
      const c = String(row[j] ?? '').toUpperCase()
      if (c.includes('VALOR') && (c.includes('LÍQUIDO') || c.includes('LIQUIDO'))) {
        for (let k = j + 1; k < row.length; k++) {
          const v = row[k]
          if (typeof v === 'number' && v > 0) { totalAba += v; break }
        }
      }
    }
  }

  // 2B: RESUMO lateral col7=nome, col9=valor (Rio Claro, Mococa, Pinhal)
  if (totalAba === 0) {
    for (let i = 0; i < Math.min(8, dados.length); i++) {
      const row = dados[i] || []
      const c7 = String(row[7] ?? '').toUpperCase()
      const c8 = String(row[8] ?? '').toUpperCase()
      const c9 = String(row[9] ?? '').toUpperCase()
      if ((c7.includes('NOME') || c7.includes('RESUMO')) &&
          (c8.includes('DIARIA') || c8.includes('Nº') || c8.includes('N ') || c8.includes('VIAGEN')) &&
          (c9.includes('VALOR') || c9.includes('TOTAL'))) {
        for (let j = i + 1; j < dados.length; j++) {
          const r = dados[j] || []
          const nome = String(r[7] ?? '').trim()
          const val = r[9]
          if (nome.length > 2 && typeof val === 'number' && val > 0 &&
              !nome.toUpperCase().includes('COMPLEMENTO') &&
              !nome.toUpperCase().includes('TOTAL') &&
              !nome.toUpperCase().includes('ADM')) {
            totalAba += val
          }
        }
        break
      }
    }
  }

  // 2C: TOTAL BRUTO (Diárias Águas)
  if (totalAba === 0) {
    for (const row of dados) {
      if (String(row?.[0] ?? '').toUpperCase().includes('TOTAL BRUTO')) {
        const v = row[4]
        if (typeof v === 'number' && v > 0) totalAba += v
      }
    }
  }

  // 2D: TOTAL LIQUIDO (evita triplicar quinzenas)
  if (totalAba === 0) {
    for (const row of dados) {
      for (let j = 0; j < (row || []).length; j++) {
        const c = String(row[j] ?? '').toUpperCase()
        if (c.includes('TOTAL LIQUIDO') || c.includes('TOTAL LÍQUIDO')) {
          for (let k = j + 1; k < row.length; k++) {
            const v = row[k]
            if (typeof v === 'number' && v > 0) { totalAba += v; break }
          }
        }
      }
    }
  }

  // 2E: TOTAL A RECEBER (fallback final)
  if (totalAba === 0) {
    const palavras = ['TOTAL A RECEBER', 'TOTAL A  RECEBER', 'TOTAL A RECEBIDO']
    for (const row of dados) {
      for (let j = 0; j < (row || []).length; j++) {
        const c = String(row[j] ?? '').toUpperCase()
        if (palavras.some(p => c.includes(p))) {
          for (let k = j + 1; k < row.length; k++) {
            const v = row[k]
            if (typeof v === 'number' && v > 0) { totalAba += v; break }
          }
        }
      }
    }
  }

  if (totalAba <= 0) return []

  return [{
    nome: `__TOTAL__${cidade}`,
    cpf: undefined, cidade,
    funcao: 'Motorista' as Funcao,
    salarioBase: totalAba, totalReceber: totalAba,
    banco: undefined, agencia: undefined, conta: undefined, pix: undefined,
    observacoes: undefined, jaExiste: true,
  }]
}

function parsearUbatuba(dados: any[][], cidade: Cidade): ColaboradorImportado[] {
  // ── 1. Detectar colunas do resumo automaticamente ────────────────────────
  // Procura "RESUMO PAGAMENTO" para achar a coluna base
  // Pode estar em col7 (abril) ou col8 (março) dependendo do arquivo
  let colIdx = 7   // coluna do índice (número sequencial)
  let colNome = 8  // coluna do nome
  let colValor = 10 // coluna do valor
  for (let i = 0; i < Math.min(10, dados.length); i++) {
    const row = dados[i] || []
    for (let j = 6; j <= 9; j++) {
      if (String(row[j] ?? '').toUpperCase().includes('RESUMO')) {
        colIdx = j
        colNome = j + 1
        // Procurar coluna do valor no cabeçalho (próxima linha com VALOR TOTAL)
        for (let k = i + 1; k < Math.min(i + 4, dados.length); k++) {
          const headerRow = dados[k] || []
          for (let m = j; m < headerRow.length; m++) {
            if (String(headerRow[m] ?? '').toUpperCase().includes('VALOR')) {
              colValor = m
              break
            }
          }
        }
        break
      }
    }
  }

  // ── 2. Resumo à direita: colIdx=número, colNome=nome, colValor=valor ──────
  const resumo: { idx: number; apelido: string; valor: number }[] = []
  for (let i = 0; i < dados.length; i++) {
    const row = dados[i] || []
    const idx = row[colIdx]
    const apelido = String(row[colNome] ?? '').trim()
    const valor = row[colValor]
    if (typeof idx === 'number' && idx >= 1 && idx <= 100 &&
        apelido.length > 1 && typeof valor === 'number' && valor > 0 &&
        !apelido.toUpperCase().includes('TOTAL')) {
      resumo.push({ idx, apelido, valor })
    }
  }

  // ── 2b. Fallback Ubatuba: quando resumo não tem valores (folha de diárias)
  // Soma "TOTAL LIQUIDO RECEBIDO" de cada bloco individual (col5 = índice 5)
  // Ativa quando resumo está vazio OU quando nenhum item tem valor > 0
  const resumoTemValores = resumo.some(r => r.valor > 0)
  if (resumo.length === 0 || !resumoTemValores) {
    let totalUbatuba = 0
    for (let i = 0; i < dados.length; i++) {
      const row = dados[i] || []
      const c1 = String(row[1] ?? '').toUpperCase()
      const c5 = row[5]
      if ((c1.includes('TOTAL LIQUIDO') || c1.includes('TOTAL LÍQUIDO')) &&
          typeof c5 === 'number' && c5 > 0) {
        totalUbatuba += c5
      }
    }
    if (totalUbatuba > 0) {
      return [{
        nome: '__TOTAL__' + cidade,
        cpf: undefined,
        cidade,
        funcao: 'Motorista' as Funcao,
        salarioBase: totalUbatuba,
        totalReceber: totalUbatuba,
        banco: undefined, agencia: undefined, conta: undefined, pix: undefined,
        observacoes: undefined,
        jaExiste: true,
      }]
    }
    return []
  }

  // ── 2. Blocos individuais: CPF(col1) | NOME(col3) | BANCO/AG/CC(col5) ────
  // Padrão: linha com CPF válido em col1 e nome em col3
  const mapaDados: Record<string, {
    cpf: string; nomeCompleto: string; banco: string
    agencia: string; conta: string; pix: string; salarioBase: number
  }> = {}

  for (let i = 0; i < dados.length; i++) {
    const row = dados[i] || []
    const col1 = String(row[1] ?? '').trim()
    const col3 = String(row[3] ?? '').trim()
    const col5 = String(row[5] ?? '').trim()

    // Linha de cabeçalho: CPF(col1 literal "CPF") + nome(col3)
    if (col1.toUpperCase() === 'CPF' && col3.toUpperCase() === 'NOME') {
      // Próxima linha tem os dados reais
      const proxRow = dados[i + 1] || []
      const cpf = String(proxRow[1] ?? '').trim()
      const nome = String(proxRow[3] ?? '').trim()
      const bancoCel = String(proxRow[5] ?? '').trim()

      if (/^\d{3}[\.\-]?\d{3}[\.\-]?\d{3}[\.\-]?\d{2}$/.test(cpf) && nome.length > 2) {
        // Banco: pode estar na col5 da linha ou na próxima
        let banco = ''
        let agencia = ''
        let conta = ''
        let pix = ''
        let salarioBase = 0

        // Varre as próximas linhas até ___
        for (let j = i + 1; j < Math.min(i + 50, dados.length); j++) {
          const r = dados[j] || []
          const c1 = String(r[1] ?? '').trim()
          const c3 = String(r[3] ?? '').trim()
          const c5 = String(r[5] ?? '').trim()
          const texto = [c1, c3, c5].join(' ')

          if (texto.includes('___')) break

          // Banco
          if (!banco) {
            for (const b of ['NUBANK','NU PAGAMENTOS','ITAÚ','ITAU','CAIXA','BRADESCO','SANTANDER','BANCO DO BRASIL','INTER']) {
              if (texto.toUpperCase().includes(b)) { banco = normalizarBanco(b); break }
            }
          }

          // Agência e conta da col5 (ex: "AG.1566 C/C 60315-3")
          if (!agencia) {
            const agM = c5.match(/AG\.?\s*(\d{3,6})/i) || bancoCel.match(/AG\.?\s*(\d{3,6})/i)
            if (agM) agencia = agM[1]
          }
          if (!conta) {
            const ctM = c5.match(/C\/?C\s*([0-9\s\-]+)/i) || bancoCel.match(/C\/?C\s*([0-9\s\-]+)/i)
            if (ctM) conta = ctM[1].trim().replace(/\s+/g, '')
          }

          // PIX: CPF como chave ou número de telefone
          if (!pix) {
            // Formato "CPF | NOME | PIX" — col5 tem o CPF como PIX
            const pixM = c5.match(/\d{3}[\.\-]?\d{3}[\.\-]?\d{3}[\.\-]?\d{2}/)
            if (pixM && pixM[0] !== cpf) pix = pixM[0]  // outro CPF como PIX
            else if (pixM && pixM[0] === cpf && !agencia) pix = cpf  // próprio CPF como PIX
          }

          // Salário base da linha de salário
          if (!salarioBase) {
            const salM = c1.match(/SALARIO[^R\d]*R?\$?\s*([\d\.,]+)/i) ||
                         c3.match(/SALARIO[^R\d]*R?\$?\s*([\d\.,]+)/i)
            if (salM) {
              const v = extrairRealBR(salM[1])
              if (v >= 500 && v <= 30000) salarioBase = v
            }
          }
        }

        // Banco do cabeçalho se não achou no bloco
        if (!banco) {
          for (const b of ['ITAÚ','ITAU','CAIXA','BRADESCO','NUBANK','INTER']) {
            if (bancoCel.toUpperCase().includes(b)) { banco = normalizarBanco(b); break }
          }
        }

        // Agência/conta do bancoCel se não achou no bloco (ex: "AG.1566 C/C 60315-3")
        if (!agencia) {
          const agM = bancoCel.match(/AG\.?\s*(\d{3,6})/i)
          if (agM) agencia = agM[1]
        }
        if (!conta) {
          const ctM = bancoCel.match(/C\/?C\s*([0-9\s\-]+)/i)
          if (ctM) conta = ctM[1].trim().replace(/\s+/g, '')
        }

        // Mapa por primeiro nome (para cruzar com o resumo)
        const primNome = nome.split(' ')[0].toUpperCase()
        mapaDados[primNome] = { cpf, nomeCompleto: nome, banco, agencia, conta, pix, salarioBase }
        // Também indexa por nome completo
        mapaDados[nome.toUpperCase()] = mapaDados[primNome]
      }
    }

    // Formato alternativo: CPF válido diretamente na col1 com nome na col3
    if (/^\d{3}[\.\-]?\d{3}[\.\-]?\d{3}[\.\-]?\d{2}$/.test(col1) && col3.length > 2 &&
        col3.toUpperCase() !== 'NOME') {
      const primNome = col3.split(' ')[0].toUpperCase()
      if (!mapaDados[primNome]) {
        // Extrai banco/ag/conta da col5
        let banco = '', agencia = '', conta = '', pix = ''
        for (const b of ['ITAÚ','ITAU','CAIXA','BRADESCO','NUBANK','INTER','BANCO DO BRASIL']) {
          if (col5.toUpperCase().includes(b)) { banco = normalizarBanco(b); break }
        }
        const agM = col5.match(/AG\.?\s*(\d{3,6})/i)
        if (agM) agencia = agM[1]
        const ctM = col5.match(/C\/?C\s*([0-9\s\-]+)/i)
        if (ctM) conta = ctM[1].trim().replace(/\s+/g, '')

        // Verifica se col5 é o PIX (ex: próprio CPF como chave)
        const pixM = col5.match(/\d{3}[\.\-]?\d{3}[\.\-]?\d{3}[\.\-]?\d{2}/)
        if (pixM) pix = pixM[0]

        mapaDados[primNome] = { cpf: col1, nomeCompleto: col3, banco, agencia, conta, pix, salarioBase: 0 }
        mapaDados[col3.toUpperCase()] = mapaDados[primNome]
      }
    }
  }

  // ── 3. Cruza resumo com dados completos ──────────────────────────────────
  return resumo.map(({ apelido, valor }) => {
    // Busca por apelido ou primeiro nome
    const apelidoUp = apelido.split(' ')[0].toUpperCase()
    const dadosColab = mapaDados[apelido.toUpperCase()] ||
                       mapaDados[apelidoUp] ||
                       Object.entries(mapaDados).find(([k]) =>
                         k.startsWith(apelidoUp) || apelidoUp.startsWith(k.split(' ')[0])
                       )?.[1]

    const salBase = dadosColab?.salarioBase || valor

    return {
      nome: dadosColab?.nomeCompleto || apelido,
      cpf: dadosColab?.cpf,
      cidade,
      funcao: 'Motorista' as Funcao,
      salarioBase: salBase,
      totalReceber: valor,
      banco: dadosColab?.banco || undefined,
      agencia: dadosColab?.agencia || undefined,
      conta: dadosColab?.conta || undefined,
      pix: dadosColab?.pix || (dadosColab?.cpf && !dadosColab?.conta ? dadosColab.cpf : undefined),
      observacoes: dadosColab ? undefined : 'Ubatuba — verificar nome completo e dados bancários',
      jaExiste: false,
    }
  })
}

// ── Extrai total geral da aba TOTAL GERAL DA FOLHA ─────────────────────────

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
  const [abaAtiva, setAbaAtiva] = useState<Aba>('pagamentos')
  const [processando, setProcessando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [importando, setImportando] = useState(false)
  const [erroImport, setErroImport] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [mesAnoReimportar, setMesAnoReimportar] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputReimportarRef = useRef<HTMLInputElement>(null)

  const processarExcel = async (arquivo: File, mesAnoOverride?: string) => {
    setProcessando(true)
    setErroImport(null)
    setResultado(null)
    try {
      const buf = await arquivo.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const colaboradores: ColaboradorImportado[] = []
      const erros: string[] = []
      const avisos: string[] = []

      const nomeArq = arquivo.name
      // Detecta mês e ano pelo nome do arquivo
      // Formatos aceitos: "03__Folha...", "03_Antecip...", "Folha_Março_2025...", "2025-03..."
      const matchMes = nomeArq.match(/^(\d{2})[_\-]/)
      const matchAno = nomeArq.match(/(20\d{2})/)
      const mes = matchMes ? parseInt(matchMes[1]) : new Date().getMonth() + 1
      const anoArq = matchAno ? parseInt(matchAno[1]) : new Date().getFullYear()
      // Sanidade: mês entre 1-12, ano entre 2020-2030
      const mesValido = mes >= 1 && mes <= 12 ? mes : new Date().getMonth() + 1
      const anoValido = anoArq >= 2020 && anoArq <= 2030 ? anoArq : new Date().getFullYear()
      const ano = anoValido
      // Se veio de "Reimportar folha" de um mês específico, usa ele como override
      const mesAno = mesAnoOverride || `${ano}-${String(mesValido).padStart(2, '0')}`

      const { total: totalReal, porCidade: totaisReais } = extrairTotalGeral(wb)

      for (const nomeAba of wb.SheetNames) {
        const chave = nomeAba.trim().toUpperCase()
        const cidade = MAPA_CIDADES[chave]
        if (!cidade) {
          if (!['TOTAL GERAL DA FOLHA', 'TOTAL GERAL'].includes(chave)) {
            erros.push(`Aba "${nomeAba}" não reconhecida`)
          }
          continue
        }
        const ws = wb.Sheets[nomeAba]
        const dadosAba: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
        const colabs = chave === 'UBATUBA'
          ? parsearUbatuba(dadosAba, cidade)
          : parsearAba(dadosAba, cidade)

        if (colabs.length === 0) {
          erros.push(`Aba "${nomeAba}" — nenhum colaborador extraído`)
        }
        colaboradores.push(...colabs)
      }

      // Marca duplicatas
      const res = await fetch('/api/dp/colaboradores')
      const cadastrados: Colaborador[] = await res.json()
      // Filtrar registros internos __TOTAL__ (gerados pelo fallback de folhas sem RESUMO)
      const semInternos = colaboradores.filter(c => !c.nome.startsWith('__TOTAL__'))
      const comStatus = semInternos.map(c => {
        const existente = cadastrados.find(cad =>
          cad.nome.toLowerCase().trim() === c.nome.toLowerCase().trim()
        )
        return { ...c, jaExiste: !!existente, colaboradorId: existente?.id }
      })

      // Para o totalPorCidade, usar TODOS os registros (incluindo __TOTAL__)
      // pois os __TOTAL__ carregam o valor real das cidades sem RESUMO
      const totalFolha = colaboradores.reduce((s, c) => s + c.totalReceber, 0)
      const totalPorCidade: Record<string, number> = {}
      const valorPorColaborador: Record<string, number> = {}
      // Usar todos os colaboradores (incluindo __TOTAL__) para totalPorCidade
      for (const c of colaboradores) {
        totalPorCidade[c.cidade] = (totalPorCidade[c.cidade] || 0) + c.totalReceber
      }
      // valorPorColaborador: apenas os colaboradores reais (sem __TOTAL__)
      for (const c of comStatus) {
        valorPorColaborador[c.nome.trim().toUpperCase()] = c.totalReceber
      }

      const nomeUpper = nomeArq.toUpperCase()
      const tipoFolha: 'antecipacao' | 'folha' = nomeUpper.includes('ANTECIP') ? 'antecipacao' : 'folha'

      setResultado({ colaboradores: comStatus, mesAno, totalFolha, totalReal, totalPorCidade, valorPorColaborador, nomeArquivo: nomeArq, tipoFolha, erros, avisos })
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

    // Sempre salva o fechamento — independente de ter colaboradores novos
    const fechamento = {
      id: `fech_${resultado.mesAno}_${resultado.tipoFolha}`,
      mesAno: resultado.mesAno,
      tipo: resultado.tipoFolha,
      arquivo: resultado.nomeArquivo,
      totalGeral: resultado.totalFolha,
      totalPorCidade: resultado.totalPorCidade,
      valorPorColaborador: resultado.valorPorColaborador,
      totalColaboradores: resultado.colaboradores.length,
      dataImport: agora,
    }
    await fetch('/api/dp/fechamentos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fechamento),
    })

    // Registra pagamento automaticamente para cada cidade que tem valor
    // Data do pagamento: dia 20 para antecipação, dia 10 para folha
    const [anoFech, mesFech] = resultado.mesAno.split('-').map(Number)
    const diaPag = resultado.tipoFolha === 'antecipacao' ? 20 : 10
    // Para folha: o pagamento é no mês seguinte (dia 10)
    const mesPagNum = resultado.tipoFolha === 'folha'
      ? (mesFech === 12 ? 1 : mesFech + 1)
      : mesFech
    const anoPagNum = resultado.tipoFolha === 'folha' && mesFech === 12
      ? anoFech + 1
      : anoFech
    const dataPagStr = `${String(diaPag).padStart(2, '0')}/${String(mesPagNum).padStart(2, '0')}/${anoPagNum}`

    for (const [cidadeStr, valorCidade] of Object.entries(resultado.totalPorCidade)) {
      if (valorCidade > 0) {
        const pag = {
          id: `pag_${resultado.mesAno}_${resultado.tipoFolha}_${cidadeStr.replace(/\s+/g, '_')}`,
          mesAno: resultado.mesAno,
          cidade: cidadeStr,
          tipo: resultado.tipoFolha,
          valor: valorCidade,
          dataPagamento: dataPagStr,
          createdAt: agora,
        }
        await fetch('/api/dp/pagamentos', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pag),
        })
      }
    }

    // Cadastra colaboradores novos (se houver)
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
    // Se tem novos, vai para colaboradores; senão fica no resumo
    setAbaAtiva(novos.length > 0 ? 'colaboradores' : 'resumo')
  }

  const handleReimportar = (mesAno: string) => {
    setMesAnoReimportar(mesAno)
    setTimeout(() => inputReimportarRef.current?.click(), 50)
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
              <input ref={inputReimportarRef} type="file" accept=".xlsx,.xls" hidden onChange={e => { const f = e.target.files?.[0]; if (f) { processarExcel(f, mesAnoReimportar || undefined); setMesAnoReimportar(null); e.target.value = '' } }} />
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

              {/* Confirmação de mês/tipo — editável antes de salvar */}
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
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>valor real do desembolso</div>
                    </div>
                    <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10, padding: '0.875rem', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase' as const }}>📋 Total geral folha</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-2)' }}>{fmt(resultado.totalReal)}</div>
                      <div style={{ fontSize: 10, color: diff > 0 ? '#d97706' : '#16a34a', marginTop: 2 }}>
                        {diff > 0 ? `+${fmt(diff)} (${difpct}% acima — itens extras)` : diff < -1 ? `${fmt(diff)} (${difpct}% abaixo)` : '✓ valores idênticos'}
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
                    <th>CPF</th>
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
                      <td style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-3)' }}>{c.cpf || '—'}</td>
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
                  disabled={importando}
                  style={{ padding: '0.55rem 1.25rem', fontSize: 13, fontWeight: 700, background: 'var(--navy)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', opacity: importando || resultado.colaboradores.filter(c => !c.jaExiste).length === 0 ? 0.6 : 1 }}>
                  {importando ? 'Salvando...' : resultado.colaboradores.filter(c => !c.jaExiste).length > 0
  ? `Importar ${resultado.colaboradores.filter(c => !c.jaExiste).length} colaboradores`
  : 'Salvar fechamento'}
                </button>
              </div>
            </div>
          </div>
        )}

        {abaAtiva === 'resumo'        && <ResumoDPGeral key={reload} />}
        {abaAtiva === 'pagamentos'    && <ControlePagamentos key={reload} onReimportar={handleReimportar} />}
        {abaAtiva === 'colaboradores' && <CadastroColaboradores key={reload} />}
      </main>
    </div>
  )
}
