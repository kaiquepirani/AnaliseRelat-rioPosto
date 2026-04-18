import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'

// Fechamentos são registros de folha importados, identificados por mesAno + tipo
// Armazena metadados: { mesAno, tipo: 'antecipacao'|'folha', arquivo, totalGeral, totalPorCidade, dataImport }

const KEY_FECHAMENTOS = 'dp:fechamentos'

export interface Fechamento {
  id: string
  mesAno: string           // "2026-04"
  tipo: 'antecipacao' | 'folha'
  arquivo: string          // nome do arquivo original
  totalGeral: number
  totalPorCidade: Record<string, number>
  totalColaboradores: number
  dataImport: string       // ISO
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const mesAno = searchParams.get('mesAno')
    const lista = await redis.get<Fechamento[]>(KEY_FECHAMENTOS) || []
    if (mesAno) return NextResponse.json(lista.filter(f => f.mesAno === mesAno))
    return NextResponse.json(lista.sort((a, b) => b.mesAno.localeCompare(a.mesAno)))
  } catch {
    return NextResponse.json([])
  }
}

export async function POST(req: NextRequest) {
  try {
    const fechamento: Fechamento = await req.json()
    const lista = await redis.get<Fechamento[]>(KEY_FECHAMENTOS) || []
    const idx = lista.findIndex(f => f.id === fechamento.id)
    if (idx >= 0) lista[idx] = fechamento
    else lista.push(fechamento)
    await redis.set(KEY_FECHAMENTOS, lista)
    return NextResponse.json({ sucesso: true })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    const lista = await redis.get<Fechamento[]>(KEY_FECHAMENTOS) || []
    await redis.set(KEY_FECHAMENTOS, lista.filter(f => f.id !== id))
    return NextResponse.json({ sucesso: true })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
