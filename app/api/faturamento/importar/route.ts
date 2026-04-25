import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import * as XLSX from 'xlsx'
import { requisicaoAutenticada } from '@/lib/contratos-auth'
import type { FaturamentoMensal } from '@/lib/faturamento-types'
import { normalizarCidade } from '@/lib/faturamento-types'

export const runtime = 'nodejs'
export const maxDuration = 60

const redis = Redis.fromEnv()
const INDEX_KEY = 'faturamento:index'
const keyOf = (ano: number, cidade: string) => `faturamento:${ano}:${normalizarCidade(cidade)}`

const valorParaNumero = (v: any): number | null => {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return isNaN(v) ? null : v
  if (typeof v === 'string') {
    const t = v.trim()
    if (!t || t === '-' || t === '—') return null
    const limpo = t.replace(/R\$/gi, '').replace(/[^\d,.\-]/g, '').replace(/\./g, '').replace(',', '.')
    const n = Number(limpo)
    return isNaN(n) ? null : n
  }
  return null
}

const ehAbaAno = (nome: string): number | null => {
  const m = nome.trim().match(/^(\d{4})$/)
  if (!m) return null
  const ano = Number(m[1])
  if (ano >= 2000 && ano <= 2100) return ano
  return null
}

const ehLinhaTotal = (cidade: string): boolean => {
  const t = cidade.trim().toUpperCase()
  return t === 'TOTAL' || t === 'TOTAL ' || t.indexOf('TOTAL') === 0
}

interface ResultadoImportacao {
  anos: number[]
  totalCidades: number
  totalLancamentos: number
  detalhes: { ano: number; cidades: number; total: number }[]
}

export async function POST(req: NextRequest) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  let arquivo: File | null = null
  try {
    const formData = await req.formData()
    arquivo = formData.get('file') as File | null
  } catch (e: any) {
    return NextResponse.json(
      { erro: 'Falha ao ler o arquivo', detalhe: String(e?.message || e).slice(0, 300) },
      { status: 413 },
    )
  }

  if (!arquivo) {
    return NextResponse.json({ erro: 'Arquivo não enviado' }, { status: 400 })
  }
  if (arquivo.size > 8 * 1024 * 1024) {
    return NextResponse.json({ erro: 'Arquivo muito grande (limite 8 MB)' }, { status: 413 })
  }

  let workbook: XLSX.WorkBook
  try {
    const buffer = Buffer.from(await arquivo.arrayBuffer())
    workbook = XLSX.read(buffer, { type: 'buffer' })
  } catch (e: any) {
    return NextResponse.json(
      { erro: 'Não foi possível ler o Excel', detalhe: String(e?.message || e).slice(0, 300) },
      { status: 400 },
    )
  }

  const resultado: ResultadoImportacao = {
    anos: [],
    totalCidades: 0,
    totalLancamentos: 0,
    detalhes: [],
  }

  for (const nomeAba of workbook.SheetNames) {
    const ano = ehAbaAno(nomeAba)
    if (!ano) continue

    const sheet = workbook.Sheets[nomeAba]
    const dados: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })
    if (dados.length < 2) continue

    let cidadesNoAno = 0
    let totalAno = 0

    for (let i = 1; i < dados.length; i++) {
      const linha = dados[i]
      if (!linha || linha.length === 0) continue
      const cidadeRaw = linha[0]
      if (typeof cidadeRaw !== 'string' || !cidadeRaw.trim()) continue
      const cidade = cidadeRaw.trim()
      if (ehLinhaTotal(cidade)) continue

      const meses: (number | null)[] = []
      for (let j = 1; j <= 12; j++) {
        meses.push(valorParaNumero(linha[j]))
      }

      const temDado = meses.some(v => v !== null)
      if (!temDado) continue

      let total = 0
      for (const v of meses) if (typeof v === 'number') total += v

      const fm: FaturamentoMensal = { cidade, ano, meses, total }

      try {
        await redis.set(keyOf(ano, cidade), fm)
        await redis.sadd(INDEX_KEY, `${ano}:${normalizarCidade(cidade)}`)
        cidadesNoAno++
        totalAno += total
        resultado.totalLancamentos++
      } catch (e) {
        // Continua mesmo que uma cidade falhe
      }
    }

    if (cidadesNoAno > 0) {
      resultado.anos.push(ano)
      resultado.totalCidades += cidadesNoAno
      resultado.detalhes.push({ ano, cidades: cidadesNoAno, total: totalAno })
    }
  }

  await redis.set('faturamento:ultima_atualizacao', new Date().toISOString())

  if (resultado.anos.length === 0) {
    return NextResponse.json({
      erro: 'Nenhum dado válido encontrado',
      detalhe: 'O Excel deve ter abas nomeadas como anos (2022, 2023, etc) com cidades nas linhas e meses nas colunas.',
    }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    ...resultado,
    mensagem: `Importação concluída: ${resultado.totalCidades} cidades em ${resultado.anos.length} anos.`,
  })
}
