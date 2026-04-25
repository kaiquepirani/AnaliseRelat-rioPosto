import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { randomUUID } from 'crypto'
import { requisicaoAutenticada } from '@/lib/contratos-auth'

export const runtime = 'nodejs'
export const maxDuration = 60

const LIMITE_BYTES = 25 * 1024 * 1024 // 25 MB

export async function POST(req: NextRequest) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ erro: 'Armazenamento não configurado' }, { status: 500 })
  }

  let file: File | null = null
  try {
    const formData = await req.formData()
    file = formData.get('file') as File | null
  } catch (e: any) {
    return NextResponse.json(
      { erro: 'Falha ao ler o arquivo', detalhe: String(e?.message || e).slice(0, 300) },
      { status: 413 },
    )
  }

  if (!file) return NextResponse.json({ erro: 'Arquivo não enviado' }, { status: 400 })

  if (file.size > LIMITE_BYTES) {
    return NextResponse.json({
      erro: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Limite: 25 MB.`,
    }, { status: 413 })
  }

  const nomeLower = file.name.toLowerCase()
  if (!file.type.includes('pdf') && !nomeLower.endsWith('.pdf')) {
    return NextResponse.json({ erro: 'Apenas PDFs são permitidos' }, { status: 400 })
  }

  try {
    const nomeLimpo = file.name.replace(/[^\w.\-]/g, '_')
    const filename = `contratos/${randomUUID()}-${nomeLimpo}`
    const blob = await put(filename, file, { access: 'public' })
    return NextResponse.json({
      url: blob.url,
      nome: file.name,
      tamanho: file.size,
    })
  } catch (e: any) {
    return NextResponse.json(
      { erro: 'Falha ao enviar para o armazenamento', detalhe: String(e?.message || e).slice(0, 300) },
      { status: 500 },
    )
  }
}
