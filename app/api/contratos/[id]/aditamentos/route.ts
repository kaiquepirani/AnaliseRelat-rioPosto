import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { randomUUID } from 'crypto'
import { requisicaoAutenticada } from '@/lib/contratos-auth'
import type { Contrato, Aditamento } from '@/lib/contratos-types'

export const runtime = 'nodejs'

const redis = Redis.fromEnv()
const keyOf = (id: string) => `contrato:${id}`

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }
  const contrato = await redis.get<Contrato>(keyOf(params.id))
  if (!contrato) return NextResponse.json({ erro: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(contrato.aditamentos || [])
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }
  const contrato = await redis.get<Contrato>(keyOf(params.id))
  if (!contrato) return NextResponse.json({ erro: 'Contrato não encontrado' }, { status: 404 })

  const body = await req.json()
  if (!body?.arquivoUrl || !body?.arquivoNome) {
    return NextResponse.json({ erro: 'Arquivo do aditamento é obrigatório' }, { status: 400 })
  }

  const agora = new Date().toISOString()
  const novo: Aditamento = {
    id: randomUUID(),
    data: body.data || agora.slice(0, 10),
    novaDataVencimento: body.novaDataVencimento || undefined,
    novoValorMensal: body.novoValorMensal != null && body.novoValorMensal !== '' ? Number(body.novoValorMensal) : undefined,
    novoValorTotal: body.novoValorTotal != null && body.novoValorTotal !== '' ? Number(body.novoValorTotal) : undefined,
    observacoes: body.observacoes || undefined,
    arquivoUrl: String(body.arquivoUrl),
    arquivoNome: String(body.arquivoNome),
    arquivoSize: Number(body.arquivoSize) || 0,
    createdAt: agora,
  }

  const aditamentos = Array.isArray(contrato.aditamentos) ? contrato.aditamentos : []
  aditamentos.push(novo)
  aditamentos.sort((a, b) => a.data.localeCompare(b.data))

  const contratoAtualizado: Contrato = {
    ...contrato,
    aditamentos,
    dataVencimento: body.aplicarVencimento && novo.novaDataVencimento ? novo.novaDataVencimento : contrato.dataVencimento,
    valorMensal: body.aplicarValorMensal && novo.novoValorMensal != null ? novo.novoValorMensal : contrato.valorMensal,
    valorTotal: body.aplicarValorTotal && novo.novoValorTotal != null ? novo.novoValorTotal : contrato.valorTotal,
    updatedAt: agora,
  }

  await redis.set(keyOf(params.id), contratoAtualizado)
  return NextResponse.json({ ok: true, aditamento: novo, contrato: contratoAtualizado })
}
