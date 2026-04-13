import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { Extrato } from '@/lib/types'

export async function GET() {
  const extratos: Extrato[] = await redis.get('extratos') || []
  return NextResponse.json(extratos)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const extratos: Extrato[] = await redis.get('extratos') || []
  const filtrados = extratos.filter(e => e.id !== id)
  await redis.set('extratos', filtrados)
  return NextResponse.json({ sucesso: true })
}

export async function PATCH(req: NextRequest) {
  const { id, nome } = await req.json()
  const extratos: Extrato[] = await redis.get('extratos') || []
  const atualizados = extratos.map(e => {
    if (e.id !== id) return e
    return {
      ...e,
      postos: e.postos.map((p, i) => i === 0 ? { ...p, nome } : p),
    }
  })
  await redis.set('extratos', atualizados)
  return NextResponse.json({ sucesso: true })
}
