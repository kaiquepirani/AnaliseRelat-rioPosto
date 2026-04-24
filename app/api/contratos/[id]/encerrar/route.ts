import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { requisicaoAutenticada } from '@/lib/contratos-auth'
import type { Contrato } from '@/lib/contratos-types'

export const runtime = 'nodejs'

const redis = Redis.fromEnv()
const keyOf = (id: string) => `contrato:${id}`

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const contrato = await redis.get<Contrato>(keyOf(params.id))
  if (!contrato) return NextResponse.json({ erro: 'Contrato não encontrado' }, { status: 404 })

  const agora = new Date().toISOString()
  const contratoAtualizado: Contrato = {
    ...contrato,
    status: 'encerrado',
    dataEncerramento: agora.slice(0, 10),
    updatedAt: agora,
  }

  await redis.set(keyOf(params.id), contratoAtualizado)
  return NextResponse.json({ ok: true, contrato: contratoAtualizado })
}
