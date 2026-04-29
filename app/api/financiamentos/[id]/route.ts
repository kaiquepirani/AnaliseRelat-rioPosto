// src/app/api/financiamentos/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import type { Financiamento } from '@/lib/financiamentos-types'

const redis = Redis.fromEnv()
const SENHA_VALIDA = process.env.CONTRATOS_TOKEN || process.env.PAINEL_SENHA || ''
const REDIS_KEY = 'financiamentos:list'

function autorizar(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!SENHA_VALIDA) return true
  return token === SENHA_VALIDA
}

async function carregarLista(): Promise<Financiamento[]> {
  const raw = await redis.get<string | Financiamento[]>(REDIS_KEY)
  if (!raw) return []
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return [] }
  }
  return Array.isArray(raw) ? raw : []
}

async function salvarLista(lista: Financiamento[]): Promise<void> {
  await redis.set(REDIS_KEY, JSON.stringify(lista))
}

// =====================================================
// PUT: editar financiamento
// =====================================================
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!autorizar(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json() as Partial<Financiamento>
    const lista = await carregarLista()
    const idx = lista.findIndex(f => f.id === params.id)

    if (idx === -1) {
      return NextResponse.json({ erro: 'Financiamento não encontrado' }, { status: 404 })
    }

    lista[idx] = {
      ...lista[idx],
      ...body,
      id: lista[idx].id, // ID não pode mudar
      createdAt: lista[idx].createdAt,
      updatedAt: new Date().toISOString(),
    }

    await salvarLista(lista)
    return NextResponse.json(lista[idx])
  } catch (err: any) {
    console.error('PUT /api/financiamentos/[id]:', err)
    return NextResponse.json({ erro: 'Erro ao atualizar', detalhe: err?.message }, { status: 500 })
  }
}

// =====================================================
// DELETE: excluir financiamento
// =====================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!autorizar(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  try {
    const lista = await carregarLista()
    const novo = lista.filter(f => f.id !== params.id)

    if (lista.length === novo.length) {
      return NextResponse.json({ erro: 'Financiamento não encontrado' }, { status: 404 })
    }

    await salvarLista(novo)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('DELETE /api/financiamentos/[id]:', err)
    return NextResponse.json({ erro: 'Erro ao excluir', detalhe: err?.message }, { status: 500 })
  }
}

// =====================================================
// POST /[id]/pagar: avançar 1 parcela manualmente
// =====================================================
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!autorizar(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  try {
    const lista = await carregarLista()
    const idx = lista.findIndex(f => f.id === params.id)

    if (idx === -1) {
      return NextResponse.json({ erro: 'Financiamento não encontrado' }, { status: 404 })
    }

    const f = lista[idx]
    if (f.parcelaAtual >= f.totalParcelas) {
      return NextResponse.json({ erro: 'Contrato já totalmente pago' }, { status: 400 })
    }

    f.parcelaAtual += 1
    f.updatedAt = new Date().toISOString()
    lista[idx] = f

    await salvarLista(lista)
    return NextResponse.json(f)
  } catch (err: any) {
    console.error('POST /api/financiamentos/[id]:', err)
    return NextResponse.json({ erro: 'Erro ao avançar parcela', detalhe: err?.message }, { status: 500 })
  }
}
