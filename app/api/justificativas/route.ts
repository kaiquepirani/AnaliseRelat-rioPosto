import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'

export async function GET() {
  const dados: Record<string, string> = await redis.get('justificativas') || {}
  return NextResponse.json(dados)
}

export async function POST(req: NextRequest) {
  const { chave, texto } = await req.json()
  if (!chave) return NextResponse.json({ error: 'Chave obrigatória' }, { status: 400 })
  const dados: Record<string, string> = await redis.get('justificativas') || {}
  if (texto) dados[chave] = texto
  else delete dados[chave]
  await redis.set('justificativas', dados)
  return NextResponse.json({ sucesso: true })
}
