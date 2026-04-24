import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
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

  const itens = normalizarItens(body.itens)
  const aditamentos = normalizarAditamentos(body.aditamentos)

  const contrato: Contrato = {
    id,
    numero: String(body.numero || '').trim(),
    cliente: String(body.cliente || '').trim(),
    contratante: body.contratante ? String(body.contratante).trim() : undefined,
    cnpjContratante: body.cnpjContratante ? String(body.cnpjContratante).trim() : undefined,
    processoAdministrativo: body.processoAdministrativo ? String(body.processoAdministrativo).trim() : undefined,
    modalidadeLicitacao: body.modalidadeLicitacao ? String(body.modalidadeLicitacao).trim() : undefined,
    tipoServico: body.tipoServico || 'Outro',
    cidade: String(body.cidade || '').trim(),
    dataInicio: body.dataInicio || '',
    dataVencimento: body.dataVencimento || '',
    valorMensal: body.valorMensal != null && body.valorMensal !== '' ? Number(body.valorMensal) : undefined,
    valorTotal: body.valorTotal != null && body.valorTotal !== '' ? Number(body.valorTotal) : undefined,
    valorTotalOriginal: body.valorTotalOriginal != null && body.valorTotalOriginal !== ''
      ? Number(body.valorTotalOriginal)
      : (body.valorTotal != null && body.valorTotal !== '' ? Number(body.valorTotal) : undefined),
    objeto: body.objeto || '',
    observacoes: body.observacoes || '',
    itens,
    clausulaReajuste: body.clausulaReajuste || undefined,
    status: body.status || 'vigente',
    arquivoUrl: body.arquivoUrl || undefined,
    arquivoNome: body.arquivoNome || undefined,
    arquivoSize: body.arquivoSize || undefined,
    aditamentos,
    dataEncerramento: body.dataEncerramento || undefined,
    createdAt: body.createdAt || agora,
    updatedAt: agora,
  }

  if (aditamentos.length > 0) {
    const ultimo = aditamentos[aditamentos.length - 1]
    if (ultimo.novaDataVencimento) contrato.dataVencimento = ultimo.novaDataVencimento
    if (ultimo.novoValorTotal != null) contrato.valorTotal = ultimo.novoValorTotal
    if (ultimo.novoValorMensal != null) contrato.valorMensal = ultimo.novoValorMensal
  }

  if (!contrato.cliente || !contrato.dataVencimento) {
    return NextResponse.json({ erro: 'Cliente e data de vencimento são obrigatórios' }, { status: 400 })
  }

  await redis.set(keyOf(id), contrato)
  await redis.sadd(INDEX_KEY, id)
  return NextResponse.json(contrato)
}
