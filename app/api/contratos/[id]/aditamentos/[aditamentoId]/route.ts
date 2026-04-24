import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { del } from '@vercel/blob'
import { requisicaoAutenticada } from '@/lib/contratos-auth'
import type { Contrato } from '@/lib/contratos-types'

export const runtime = 'nodejs'

const redis = Redis.fromEnv()
const keyOf = (id: string) => `contrato:${id}`

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; aditamentoId: string } },
) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const contrato = await redis.get<Contrato>(keyOf(params.id))
  if (!contrato) return NextResponse.json({ erro: 'Contrato não encontrado' }, { status: 404 })

  const aditamentos = Array.isArray(contrato.aditamentos) ? contrato.aditamentos : []
  const alvo = aditamentos.find(a => a.id === params.aditamentoId)
  if (!alvo) return NextResponse.json({ erro: 'Aditamento não encontrado' }, { status: 404 })

  if (alvo.arquivoUrl && process.env.BLOB_READ_WRITE_TOKEN) {
    try { await del(alvo.arquivoUrl) } catch { /* silencioso */ }
  }

  const contratoAtualizado: Contrato = {
    ...contrato,
    aditamentos: aditamentos.filter(a => a.id !== params.aditamentoId),
    updatedAt: new Date().toISOString(),
  }

  await redis.set(keyOf(params.id), contratoAtualizado)
  return NextResponse.json({ ok: true, contrato: contratoAtualizado })
}
