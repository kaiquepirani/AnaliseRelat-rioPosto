// app/api/gestao/terceirizacao/route.ts
// =============================================================================
// CRUD de lançamentos de terceirização para o painel Gestão Operacional.
//
// Cada lançamento é um custo manual atribuído a uma base operacional num mês:
//   { id, baseId, mesAno, nome, valor, createdAt }
//
// São SOMADOS na Margem do painel Gestão como uma linha separada:
//   Margem = Receita − Combustível − Folha − Terceirização
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'

const KEY_TERCEIRIZACAO = 'gestao:terceirizacao'

export interface LancamentoTerceirizacao {
  id: string
  baseId: string       // id da BaseOperacional (ex: 'mogi-mirim', 'itapira-educacao')
  mesAno: string       // formato 'AAAA-MM' (ex: '2026-02')
  nome: string         // nome do terceirizado (empresa/pessoa)
  valor: number        // valor pago em reais
  createdAt: string    // ISO timestamp
}

export async function GET() {
  try {
    const dados = await redis.get<LancamentoTerceirizacao[]>(KEY_TERCEIRIZACAO)
    return NextResponse.json(dados || [])
  } catch {
    return NextResponse.json([])
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (!body.baseId || !body.mesAno || !body.nome || body.valor == null) {
      return NextResponse.json(
        { erro: 'Faltam campos obrigatórios: baseId, mesAno, nome, valor' },
        { status: 400 },
      )
    }
    const valorNum = Number(body.valor)
    if (!Number.isFinite(valorNum) || valorNum <= 0) {
      return NextResponse.json({ erro: 'Valor deve ser positivo' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}$/.test(body.mesAno)) {
      return NextResponse.json({ erro: 'mesAno deve estar no formato AAAA-MM' }, { status: 400 })
    }

    const lancamento: LancamentoTerceirizacao = {
      id: body.id || `terc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      baseId: String(body.baseId),
      mesAno: String(body.mesAno),
      nome: String(body.nome).trim(),
      valor: valorNum,
      createdAt: body.createdAt || new Date().toISOString(),
    }

    const lista = await redis.get<LancamentoTerceirizacao[]>(KEY_TERCEIRIZACAO) || []
    const idx = lista.findIndex(l => l.id === lancamento.id)
    if (idx >= 0) lista[idx] = lancamento
    else lista.push(lancamento)

    await redis.set(KEY_TERCEIRIZACAO, lista)
    return NextResponse.json({ sucesso: true, lancamento })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ erro: 'id obrigatório' }, { status: 400 })

    const lista = await redis.get<LancamentoTerceirizacao[]>(KEY_TERCEIRIZACAO) || []
    const novo = lista.filter(l => l.id !== id)
    await redis.set(KEY_TERCEIRIZACAO, novo)
    return NextResponse.json({ sucesso: true, removidos: lista.length - novo.length })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}

// Limpa todos os lançamentos (usado por "Zona de perigo" se você quiser)
export async function PATCH() {
  try {
    await redis.set(KEY_TERCEIRIZACAO, [])
    return NextResponse.json({ sucesso: true })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
