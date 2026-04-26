import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { chaveVinculoPosto, type VinculosPostos } from '@/lib/gestao-types'

const KEY = 'gestao:vinculos:postos'

/**
 * GET /api/vinculos-postos
 * Retorna o mapa { nomeNormalizado: baseId }.
 * Usado tanto pelo dashboard (/dashboard) quanto pela /gestao.
 */
export async function GET() {
  try {
    const dados = await redis.get<VinculosPostos>(KEY)
    return NextResponse.json(dados || {})
  } catch {
    return NextResponse.json({})
  }
}

/**
 * POST /api/vinculos-postos
 * Body: { nomePosto: string, baseId: string }
 * Cria/atualiza o vínculo manual de um posto a uma base.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const nomePosto = String(body?.nomePosto || '').trim()
    const baseId = String(body?.baseId || '').trim()
    if (!nomePosto || !baseId) {
      return NextResponse.json(
        { erro: 'nomePosto e baseId são obrigatórios' },
        { status: 400 },
      )
    }
    const chave = chaveVinculoPosto(nomePosto)
    if (!chave) {
      return NextResponse.json({ erro: 'nomePosto inválido' }, { status: 400 })
    }
    const dados = (await redis.get<VinculosPostos>(KEY)) || {}
    dados[chave] = baseId
    await redis.set(KEY, dados)
    return NextResponse.json({ sucesso: true, total: Object.keys(dados).length })
  } catch (e: any) {
    return NextResponse.json({ erro: e?.message || 'erro' }, { status: 500 })
  }
}

/**
 * DELETE /api/vinculos-postos
 * Body: { nomePosto: string }
 * Remove o vínculo manual (volta ao matching tolerante padrão).
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json()
    const nomePosto = String(body?.nomePosto || '').trim()
    if (!nomePosto) {
      return NextResponse.json({ erro: 'nomePosto obrigatório' }, { status: 400 })
    }
    const chave = chaveVinculoPosto(nomePosto)
    const dados = (await redis.get<VinculosPostos>(KEY)) || {}
    delete dados[chave]
    await redis.set(KEY, dados)
    return NextResponse.json({ sucesso: true, total: Object.keys(dados).length })
  } catch (e: any) {
    return NextResponse.json({ erro: e?.message || 'erro' }, { status: 500 })
  }
}
