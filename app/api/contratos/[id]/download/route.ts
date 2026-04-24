import { NextRequest } from 'next/server'
import { Redis } from '@upstash/redis'
import { get } from '@vercel/blob'
import { requisicaoAutenticada } from '@/lib/contratos-auth'
import type { Contrato } from '@/lib/contratos-types'

export const runtime = 'nodejs'

const redis = Redis.fromEnv()
const keyOf = (id: string) => `contrato:${id}`

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!requisicaoAutenticada(req)) {
    return new Response(JSON.stringify({ erro: 'Não autorizado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const contrato = await redis.get<Contrato>(keyOf(params.id))
  if (!contrato || !contrato.arquivoUrl) {
    return new Response(JSON.stringify({ erro: 'Arquivo não encontrado' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const blob = await get(contrato.arquivoUrl)
    const nome = (contrato.arquivoNome || 'contrato.pdf').replace(/"/g, '')
    return new Response(blob.stream, {
      status: 200,
      headers: {
        'Content-Type': blob.contentType || 'application/pdf',
        'Content-Disposition': `inline; filename="${nome}"`,
        'Cache-Control': 'private, no-cache',
      },
    })
  } catch {
    return new Response(JSON.stringify({ erro: 'Falha ao buscar arquivo' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
