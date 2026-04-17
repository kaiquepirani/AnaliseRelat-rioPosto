import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { Lancamento } from '@/lib/dp-types'

function keyLancamentos(mesAno: string) {
  return `dp:lancamentos:${mesAno}`
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const mesAno = searchParams.get('mesAno') // "2026-03"
    const colaboradorId = searchParams.get('colaboradorId')

    if (!mesAno) return NextResponse.json({ erro: 'mesAno obrigatório' }, { status: 400 })

    const lista = await redis.get<Lancamento[]>(keyLancamentos(mesAno)) || []
    if (colaboradorId) return NextResponse.json(lista.filter(l => l.colaboradorId === colaboradorId))
    return NextResponse.json(lista)
  } catch {
    return NextResponse.json([])
  }
}

export async function POST(req: NextRequest) {
  try {
    const lancamento: Lancamento = await req.json()
    const lista = await redis.get<Lancamento[]>(keyLancamentos(lancamento.mesAno)) || []
    const idx = lista.findIndex(l => l.id === lancamento.id)
    if (idx >= 0) lista[idx] = lancamento
    else lista.push(lancamento)
    await redis.set(keyLancamentos(lancamento.mesAno), lista)
    return NextResponse.json({ sucesso: true })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id, mesAno } = await req.json()
    const lista = await redis.get<Lancamento[]>(keyLancamentos(mesAno)) || []
    await redis.set(keyLancamentos(mesAno), lista.filter(l => l.id !== id))
    return NextResponse.json({ sucesso: true })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
