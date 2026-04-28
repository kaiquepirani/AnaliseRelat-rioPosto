import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'

const KEY_FECHAMENTOS = 'dp:fechamentos'

export interface Fechamento {
  id: string
  mesAno: string
  tipo: 'antecipacao' | 'folha'
  arquivo: string
  totalGeral: number
  totalPorCidade: Record<string, number>
  valorPorColaborador: Record<string, number>   // ← CAMPO ADICIONADO
  totalColaboradores: number
  dataImport: string
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
    const body = await req.json()
    // Usar spread explícito para garantir que valorPorColaborador é preservado
    const fechamento: Fechamento = {
      id:                   body.id,
      mesAno:               body.mesAno,
      tipo:                 body.tipo,
      arquivo:              body.arquivo,
      totalGeral:           body.totalGeral,
      totalPorCidade:       body.totalPorCidade       ?? {},
      valorPorColaborador:  body.valorPorColaborador  ?? {},   // ← PERSISTIDO
      totalColaboradores:   body.totalColaboradores   ?? 0,
      dataImport:           body.dataImport,
    }
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

// ⚠️ Limpa TODOS os fechamentos — usado pelo botão "Limpar tudo" do ResumoDPGeral
export async function PATCH() {
  try {
    await redis.set(KEY_FECHAMENTOS, [])
    return NextResponse.json({ sucesso: true, mensagem: 'Todos os fechamentos foram removidos.' })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
