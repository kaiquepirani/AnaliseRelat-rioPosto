import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { Colaborador } from '@/lib/dp-types'

const KEY_COLABORADORES = 'dp:colaboradores'

export async function GET() {
  try {
    const dados = await redis.get<Colaborador[]>(KEY_COLABORADORES)
    return NextResponse.json(dados || [])
  } catch {
    return NextResponse.json([])
  }
}

export async function POST(req: NextRequest) {
  try {
    const colaborador: Colaborador = await req.json()
    const lista = await redis.get<Colaborador[]>(KEY_COLABORADORES) || []
    const idx = lista.findIndex(c => c.id === colaborador.id)
    if (idx >= 0) lista[idx] = colaborador
    else lista.push(colaborador)
    await redis.set(KEY_COLABORADORES, lista)
    return NextResponse.json({ sucesso: true })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    const lista = await redis.get<Colaborador[]>(KEY_COLABORADORES) || []
    await redis.set(KEY_COLABORADORES, lista.filter(c => c.id !== id))
    return NextResponse.json({ sucesso: true })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
