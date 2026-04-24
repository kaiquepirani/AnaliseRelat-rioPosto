import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { randomUUID } from 'crypto'
import { requisicaoAutenticada } from '@/lib/contratos-auth'
import type { Contrato, Aditamento, ItemContrato, TipoAditamento } from '@/lib/contratos-types'

export const runtime = 'nodejs'

const redis = Redis.fromEnv()
const keyOf = (id: string) => `contrato:${id}`

const TIPOS_ADITAMENTO: TipoAditamento[] = ['reajuste', 'acrescimo', 'supressao', 'prorrogacao', 'misto']

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

// Dado um contrato, retorna o estado atual dos itens (último aditamento ou originais)
const itensAtuais = (contrato: Contrato): ItemContrato[] => {
  const ads = contrato.aditamentos
  if (ads && ads.length > 0) {
    for (let i = ads.length - 1; i >= 0; i--) {
      const ad = ads[i]
      if (ad.itensResultantes && ad.itensResultantes.length > 0) {
        return ad.itensResultantes
      }
    }
  }
  return contrato.itens || []
}

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
  if (!body?.data) {
    return NextResponse.json({ erro: 'Data do aditamento é obrigatória' }, { status: 400 })
  }

  const agora = new Date().toISOString()
  const aditamentosExistentes = Array.isArray(contrato.aditamentos) ? contrato.aditamentos : []

  // snapshot dos itens ANTES deste aditamento
  const itensAntes = itensAtuais(contrato)

  const novo: Aditamento = {
    id: randomUUID(),
    numero: aditamentosExistentes.length + 1,
    data: String(body.data),
    tipo: TIPOS_ADITAMENTO.indexOf(body.tipo) !== -1 ? body.tipo : 'misto',
    novaDataVencimento: body.novaDataVencimento || undefined,
    novoValorMensal: body.novoValorMensal != null && body.novoValorMensal !== '' ? Number(body.novoValorMensal) : undefined,
    novoValorTotal: body.novoValorTotal != null && body.novoValorTotal !== '' ? Number(body.novoValorTotal) : undefined,
    percentualReajuste: body.percentualReajuste != null && body.percentualReajuste !== '' ? Number(body.percentualReajuste) : undefined,
    indiceReajuste: body.indiceReajuste || undefined,
    observacoes: body.observacoes || undefined,
    arquivoUrl: String(body.arquivoUrl),
    arquivoNome: String(body.arquivoNome),
    arquivoSize: Number(body.arquivoSize) || 0,
    itensAnteriores: itensAntes,
    itensResultantes: normalizarItens(body.itensResultantes),
    createdAt: agora,
  }

  const aditamentos = [...aditamentosExistentes, novo].sort((a, b) => a.data.localeCompare(b.data))
  const aditamentosRenumerados = aditamentos.map((a, idx) => ({ ...a, numero: idx + 1 }))

  const contratoAtualizado: Contrato = {
    ...contrato,
    aditamentos: aditamentosRenumerados,
    updatedAt: agora,
  }

  // Aplica efeitos ao contrato principal, se solicitado
  if (body.aplicarVencimento && novo.novaDataVencimento) {
    contratoAtualizado.dataVencimento = novo.novaDataVencimento
  }
  if (body.aplicarValorTotal && novo.novoValorTotal != null) {
    contratoAtualizado.valorTotal = novo.novoValorTotal
  }
  if (body.aplicarValorMensal && novo.novoValorMensal != null) {
    contratoAtualizado.valorMensal = novo.novoValorMensal
  }

  await redis.set(keyOf(params.id), contratoAtualizado)
  return NextResponse.json({ ok: true, aditamento: novo, contrato: contratoAtualizado })
}
