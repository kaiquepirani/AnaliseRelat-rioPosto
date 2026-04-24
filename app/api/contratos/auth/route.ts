import { NextRequest, NextResponse } from 'next/server'
import { validarSenha, gerarToken } from '@/lib/contratos-auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const senha = body?.senha
    if (typeof senha !== 'string' || !validarSenha(senha)) {
      await new Promise(r => setTimeout(r, 500))
      return NextResponse.json({ ok: false, erro: 'Senha inválida' }, { status: 401 })
    }
    return NextResponse.json({ ok: true, token: gerarToken() })
  } catch {
    return NextResponse.json({ ok: false, erro: 'Requisição inválida' }, { status: 400 })
  }
}
