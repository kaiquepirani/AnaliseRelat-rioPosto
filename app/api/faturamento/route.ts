import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { requisicaoAutenticada } from '@/lib/contratos-auth'
import type { FaturamentoMensal, FaturamentoAno, FaturamentoCompleto } from '@/lib/faturamento-types'
import { normalizarCidade, totalCidadeAno } from '@/lib/faturamento-types'

export const runtime = 'nodejs'

const redis = Redis.fromEnv()
const INDEX_KEY = 'faturamento:index'  // set de chaves "ano:cidade-normalizada"
const keyOf = (ano: number, cidade: string) => `faturamento:${ano}:${normalizarCidade(cidade)}`

// === GET: retorna faturamento completo ===
export async function GET(req: NextRequest) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }
  const ids = ((await redis.smembers(INDEX_KEY)) || []) as string[]
  if (ids.length === 0) {
    return NextResponse.json({
      anos: [], porAno: {}, totalGeral: 0, ultimaAtualizacao: '',
    } as FaturamentoCompleto)
  }
  const keys = ids.map(id => `faturamento:${id}`)
  const raw = (await redis.mget(...keys)) as (FaturamentoMensal | null)[]
  const lista = raw.filter((c): c is FaturamentoMensal => !!c)

  // Agrupa por ano
  const porAno: Record<number, FaturamentoAno> = {}
  const anosSet = new Set<number>()
  for (const fm of lista) {
    anosSet.add(fm.ano)
    if (!porAno[fm.ano]) {
      porAno[fm.ano] = {
        ano: fm.ano, totalAnual: 0,
        totalPorMes: new Array(12).fill(0),
        cidades: [],
      }
    }
    const total = totalCidadeAno(fm)
    porAno[fm.ano].cidades.push({ ...fm, total })
    porAno[fm.ano].totalAnual += total
    for (let i = 0; i < 12; i++) {
      const v = fm.meses[i]
      if (typeof v === 'number') porAno[fm.ano].totalPorMes[i] += v
    }
  }

  // Ordena cidades por total decrescente em cada ano
  for (const ano of Object.keys(porAno)) {
    porAno[Number(ano)].cidades.sort((a, b) => b.total - a.total)
  }

  const anos = Array.from(anosSet).sort((a, b) => a - b)
  const totalGeral = Object.values(porAno).reduce((s, p) => s + p.totalAnual, 0)
  const ultimaAtualizacao = (await redis.get('faturamento:ultima_atualizacao') as string) || ''

  return NextResponse.json({ anos, porAno, totalGeral, ultimaAtualizacao } as FaturamentoCompleto)
}

// === POST: salva uma cidade/ano (lançamento manual ou importação) ===
export async function POST(req: NextRequest) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }
  const body = await req.json()
  const ano = Number(body.ano)
  const cidade = String(body.cidade || '').trim()
  const meses = Array.isArray(body.meses) ? body.meses : []

  if (!ano || ano < 2000 || ano > 2100) {
    return NextResponse.json({ erro: 'Ano inválido' }, { status: 400 })
  }
  if (!cidade) {
    return NextResponse.json({ erro: 'Cidade obrigatória' }, { status: 400 })
  }
  if (meses.length !== 12) {
    return NextResponse.json({ erro: 'O array de meses deve ter 12 posições' }, { status: 400 })
  }

  const mesesNorm: (number | null)[] = meses.map((v: any) => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return isNaN(n) ? null : n
  })

  let total = 0
  for (const v of mesesNorm) if (typeof v === 'number') total += v

  const fm: FaturamentoMensal = { cidade, ano, meses: mesesNorm, total }
  const idShort = `${ano}:${normalizarCidade(cidade)}`

  await redis.set(keyOf(ano, cidade), fm)
  await redis.sadd(INDEX_KEY, idShort)
  await redis.set('faturamento:ultima_atualizacao', new Date().toISOString())

  return NextResponse.json(fm)
}

// === DELETE: remove uma cidade/ano específica ===
export async function DELETE(req: NextRequest) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }
  const url = new URL(req.url)
  const ano = Number(url.searchParams.get('ano'))
  const cidade = url.searchParams.get('cidade') || ''

  if (!ano || !cidade) {
    return NextResponse.json({ erro: 'Ano e cidade obrigatórios' }, { status: 400 })
  }

  await redis.del(keyOf(ano, cidade))
  await redis.srem(INDEX_KEY, `${ano}:${normalizarCidade(cidade)}`)
  await redis.set('faturamento:ultima_atualizacao', new Date().toISOString())

  return NextResponse.json({ ok: true })
}
