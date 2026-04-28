import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { Pagamento } from '@/lib/dp-types'

const KEY_PAGAMENTOS = 'dp:pagamentos'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const mesAno = searchParams.get('mesAno')
    const lista = await redis.get<Pagamento[]>(KEY_PAGAMENTOS) || []
    if (mesAno) return NextResponse.json(lista.filter(p => p.mesAno === mesAno))
    return NextResponse.json(lista)
  } catch {
    return NextResponse.json([])
  }
}

export async function POST(req: NextRequest) {
  try {
    const pagamento: Pagamento = await req.json()
    const lista = await redis.get<Pagamento[]>(KEY_PAGAMENTOS) || []
    const idx = lista.findIndex(p => p.id === pagamento.id)
    if (idx >= 0) lista[idx] = pagamento
    else lista.push(pagamento)
    await redis.set(KEY_PAGAMENTOS, lista)
    return NextResponse.json({ sucesso: true })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    const lista = await redis.get<Pagamento[]>(KEY_PAGAMENTOS) || []
    await redis.set(KEY_PAGAMENTOS, lista.filter(p => p.id !== id))
    return NextResponse.json({ sucesso: true })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}

// ⚠️ Limpa TODOS os pagamentos — usado pelo botão "Limpar tudo" do ResumoDPGeral
export async function PATCH() {
  try {
    await redis.set(KEY_PAGAMENTOS, [])
    return NextResponse.json({ sucesso: true, mensagem: 'Todos os pagamentos foram removidos.' })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
