// src/app/api/financiamentos/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import type { Financiamento } from '@/lib/financiamentos-types'
import { FINANCIAMENTOS_SEED } from '@/lib/financiamentos-seed'

const redis = Redis.fromEnv()

// Mesma chave de auth que /api/contratos usa.
// Ajuste o nome da env var se for diferente no seu projeto.
const SENHA_VALIDA = process.env.CONTRATOS_TOKEN || process.env.PAINEL_SENHA || ''

const REDIS_KEY = 'financiamentos:list'
const SEED_FLAG_KEY = 'financiamentos:seeded'

function autorizar(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!SENHA_VALIDA) return true // se não houver senha configurada, libera (cuidado)
  return token === SENHA_VALIDA
}

async function carregarLista(): Promise<Financiamento[]> {
  // Verifica se já foi populado o seed inicial
  const seeded = await redis.get(SEED_FLAG_KEY)
  if (!seeded) {
    // Primeiro acesso: popula com seed
    await redis.set(REDIS_KEY, JSON.stringify(FINANCIAMENTOS_SEED))
    await redis.set(SEED_FLAG_KEY, '1')
    return FINANCIAMENTOS_SEED
  }

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
// GET: listar todos os financiamentos
// =====================================================
export async function GET(req: NextRequest) {
  if (!autorizar(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }
  try {
    const lista = await carregarLista()
    return NextResponse.json(lista)
  } catch (err: any) {
    console.error('GET /api/financiamentos:', err)
    return NextResponse.json({ erro: 'Erro ao carregar', detalhe: err?.message }, { status: 500 })
  }
}

// =====================================================
// POST: criar novo financiamento
// =====================================================
export async function POST(req: NextRequest) {
  if (!autorizar(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json() as Partial<Financiamento>

    if (!body.descricao || !body.fornecedor || !body.valorParcela || !body.totalParcelas || !body.proximoVenc) {
      return NextResponse.json({ erro: 'Campos obrigatórios: descricao, fornecedor, valorParcela, totalParcelas, proximoVenc' }, { status: 400 })
    }

    const agora = new Date().toISOString()
    const novo: Financiamento = {
      id: 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      descricao: body.descricao,
      tipo: body.tipo || 'Veículo',
      planoOrigem: body.planoOrigem || 'Financiamentos',
      prefixo: body.prefixo || '',
      fornecedor: body.fornecedor,
      cc: body.cc || 'NÃO ALOCADO',
      parcelaAtual: body.parcelaAtual ?? 0,
      totalParcelas: body.totalParcelas,
      valorParcela: body.valorParcela,
      proximoVenc: body.proximoVenc,
      frequencia: body.frequencia || 'mensal',
      observacao: body.observacao || '',
      semInfo: false,
      reclassificado: false,
      temErro: false,
      novoContrato: true,
      createdAt: agora,
      updatedAt: agora,
    }

    const lista = await carregarLista()
    lista.push(novo)
    await salvarLista(lista)

    return NextResponse.json(novo, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/financiamentos:', err)
    return NextResponse.json({ erro: 'Erro ao criar', detalhe: err?.message }, { status: 500 })
  }
}
