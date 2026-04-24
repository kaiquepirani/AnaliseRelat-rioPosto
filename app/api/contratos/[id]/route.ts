import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { del } from '@vercel/blob'
import { requisicaoAutenticada } from '@/lib/contratos-auth'
import type { Contrato } from '@/lib/contratos-types'

export const runtime = 'nodejs'

const redis = Redis.fromEnv()
const INDEX_KEY = 'contratos:index'
const keyOf = (id: string) => `contrato:${id}`

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }
  const contrato = await redis.get<Contrato>(keyOf(params.id))
  if (!contrato) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(contrato)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }
  const atual = await redis.get<Contrato>(keyOf(params.id))
  if (!atual) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  const body = await req.json()
  const agora = new Date().toISOString()
  const contrato: Contrato = {
    ...atual,
    ...body,
    id: atual.id,
    createdAt: atual.createdAt,
    updatedAt: agora,
  }
  await redis.set(keyOf(params.id), contrato)
  return NextResponse.json(contrato)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }
  const atual = await redis.get<Contrato>(keyOf(params.id))
  if (atual?.arquivoUrl && process.env.BLOB_READ_WRITE_TOKEN) {
    try { await del(atual.arquivoUrl) } catch { /* silencioso */ }
  }
  await redis.del(keyOf(params.id))
  await redis.srem(INDEX_KEY, params.id)
  return NextResponse.json({ ok: true })
}
