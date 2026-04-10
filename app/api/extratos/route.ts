import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import { Extrato } from '@/lib/types'

export async function GET() {
  const extratos: Extrato[] = await kv.get('extratos') || []
  return NextResponse.json(extratos)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const extratos: Extrato[] = await kv.get('extratos') || []
  const filtrados = extratos.filter(e => e.id !== id)
  await kv.set('extratos', filtrados)
  return NextResponse.json({ sucesso: true })
}
