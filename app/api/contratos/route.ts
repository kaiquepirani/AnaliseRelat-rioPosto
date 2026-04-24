import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { randomUUID } from 'crypto'
import { requisicaoAutenticada } from '@/lib/contratos-auth'
import type { Contrato } from '@/lib/contratos-types'

export const runtime = 'nodejs'

const redis = Redis.fromEnv()
const INDEX_KEY = 'contratos:index'
const keyOf = (id: string) => `contrato:${id}`

export async function GET(req: NextRequest) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }
  const ids = ((await redis.smembers(INDEX_KEY)) || []) as string[]
  if (ids.length === 0) return NextResponse.json([])
  const keys = ids.map(keyOf)
  const raw = (await redis.mget(...keys)) as (Contrato | null)[]
  const contratos = raw.filter((c): c is Contrato => !!c)
  contratos.sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))
  return NextResponse.json(contratos)
}

export async function POST(req: NextRequest) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }
  const body = await req.json()
  const agora = new Date().toISOString()
  const id = body.id || randomUUID()
  const contrato: Contrato = {
    id,
    numero: String(body.numero || '').trim(),
    cliente: String(body.cliente || '').trim(),
    tipoServico: body.tipoServico || 'Outro',
    cidade: String(body.cidade || '').trim(),
    dataInicio: body.dataInicio || '',
    dataVencimento: body.dataVencimento || '',
    valorMensal: body.valorMensal != null && body.valorMensal !== '' ? Number(body.valorMensal) : undefined,
    valorTotal: body.valorTotal != null && body.valorTotal !== '' ? Number(body.valorTotal) : undefined,
    objeto: body.objeto || '',
    observacoes: body.observacoes || '',
    status: body.status || 'vigente',
    arquivoUrl: body.arquivoUrl || undefined,
    arquivoNome: body.arquivoNome || undefined,
    arquivoSize: body.arquivoSize || undefined,
    createdAt: body.createdAt || agora,
    updatedAt: agora,
  }
  if (!contrato.cliente || !contrato.dataVencimento) {
    return NextResponse.json({ erro: 'Cliente e data de vencimento são obrigatórios' }, { status: 400 })
  }
  await redis.set(keyOf(id), contrato)
  await redis.sadd(INDEX_KEY, id)
  return NextResponse.json(contrato)
}
