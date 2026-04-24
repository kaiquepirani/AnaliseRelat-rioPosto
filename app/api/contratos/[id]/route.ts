import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { del } from '@vercel/blob'
import { randomUUID } from 'crypto'
import { requisicaoAutenticada } from '@/lib/contratos-auth'
import type { Contrato, Aditamento, ItemContrato, TipoAditamento } from '@/lib/contratos-types'

export const runtime = 'nodejs'

const redis = Redis.fromEnv()
const INDEX_KEY = 'contratos:index'
const keyOf = (id: string) => `contrato:${id}`

const normalizarItens = (lista: any): ItemContrato[] => {
  if (!Array.isArray(lista)) return []
  return lista.map((it: any) => ({
    id: it?.id || randomUUID(),
    descricao: String(it?.descricao || 'Item').trim().slice(0, 200),
    quantidade: it?.quantidade != null && it?.quantidade !== '' ? Number(it.quantidade) : undefined,
    unidade: it?.unidade ? String(it.unidade).trim().slice(0, 30) : undefined,
    valorUnitario: it?.valorUnitario != null && it?.valorUnitario !== '' ? Number(it.valorUnitario) : undefined,
    valorTotal: it?.valorTotal != null && it?.valorTotal !== '' ? Number(it.valorTotal) : undefined,
  })).filter(it => it.descricao)
}

const TIPOS_ADITAMENTO: TipoAditamento[] = ['reajuste', 'acrescimo', 'supressao', 'prorrogacao', 'misto']

const normalizarAditamentos = (lista: any): Aditamento[] => {
  if (!Array.isArray(lista)) return []
  const ads = lista.map((a: any, idx: number) => ({
    id: a?.id || randomUUID(),
    numero: Number(a?.numero) || (idx + 1),
    data: String(a?.data || ''),
    tipo: (TIPOS_ADITAMENTO.indexOf(a?.tipo) !== -1 ? a.tipo : 'misto') as TipoAditamento,
    novaDataVencimento: a?.novaDataVencimento || undefined,
    novoValorMensal: a?.novoValorMensal != null && a?.novoValorMensal !== '' ? Number(a.novoValorMensal) : undefined,
    novoValorTotal: a?.novoValorTotal != null && a?.novoValorTotal !== '' ? Number(a.novoValorTotal) : undefined,
    percentualReajuste: a?.percentualReajuste != null && a?.percentualReajuste !== '' ? Number(a.percentualReajuste) : undefined,
    indiceReajuste: a?.indiceReajuste || undefined,
    observacoes: a?.observacoes || undefined,
    arquivoUrl: a?.arquivoUrl || undefined,
    arquivoNome: a?.arquivoNome || undefined,
    arquivoSize: a?.arquivoSize || undefined,
    itensResultantes: normalizarItens(a?.itensResultantes),
    itensAnteriores: normalizarItens(a?.itensAnteriores),
    createdAt: a?.createdAt || new Date().toISOString(),
  })).filter(a => a.data)
  ads.sort((a, b) => a.data.localeCompare(b.data))
  return ads.map((a, idx) => ({ ...a, numero: idx + 1 }))
}

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

  const itens = body.itens !== undefined ? normalizarItens(body.itens) : (atual.itens || [])
  const aditamentos = body.aditamentos !== undefined ? normalizarAditamentos(body.aditamentos) : (atual.aditamentos || [])

  const contrato: Contrato = {
    ...atual,
    ...body,
    id: atual.id,
    itens,
    aditamentos,
    createdAt: atual.createdAt,
    updatedAt: agora,
  }

  // Se há aditamentos, recalcula vencimento e valor atual baseado no último
  if (aditamentos.length > 0) {
    const ultimo = aditamentos[aditamentos.length - 1]
    if (ultimo.novaDataVencimento) contrato.dataVencimento = ultimo.novaDataVencimento
    if (ultimo.novoValorTotal != null) contrato.valorTotal = ultimo.novoValorTotal
    if (ultimo.novoValorMensal != null) contrato.valorMensal = ultimo.novoValorMensal
  }

  await redis.set(keyOf(params.id), contrato)
  return NextResponse.json(contrato)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }
  const atual = await redis.get<Contrato>(keyOf(params.id))

  // Apaga PDFs do Blob (contrato principal + todos os aditamentos)
  if (atual && process.env.BLOB_READ_WRITE_TOKEN) {
    const urls: string[] = []
    if (atual.arquivoUrl) urls.push(atual.arquivoUrl)
    if (Array.isArray(atual.aditamentos)) {
      for (const ad of atual.aditamentos) {
        if (ad.arquivoUrl) urls.push(ad.arquivoUrl)
      }
    }
    for (const url of urls) {
      try { await del(url) } catch { /* silencioso */ }
    }
  }

  await redis.del(keyOf(params.id))
  await redis.srem(INDEX_KEY, params.id)
  return NextResponse.json({ ok: true })
}
