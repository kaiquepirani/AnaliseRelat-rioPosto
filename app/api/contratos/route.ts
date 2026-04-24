import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { randomUUID } from 'crypto'
import { requisicaoAutenticada } from '@/lib/contratos-auth'

export const runtime = 'nodejs'

const LIMITE_BYTES = 4 * 1024 * 1024 // ~4 MB (dentro do limite Hobby da Vercel)

export async function POST(req: NextRequest) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { erro: 'Armazenamento não configurado' },
      { status: 500 },
    )
  }
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ erro: 'Arquivo não enviado' }, { status: 400 })
  if (file.size > LIMITE_BYTES) {
    return NextResponse.json({
      erro: 'Arquivo maior que 4 MB. Para PDFs maiores, use o botão "✨ Importar PDF (IA)" que faz upload direto ao armazenamento.',
    }, { status: 413 })
  }
  const nomeLower = file.name.toLowerCase()
  if (!file.type.includes('pdf') && !nomeLower.endsWith('.pdf')) {
    return NextResponse.json({ erro: 'Apenas PDFs são permitidos' }, { status: 400 })
  }
  const nomeLimpo = file.name.replace(/[^\w.\-]/g, '_')
  const filename = `contratos/${randomUUID()}-${nomeLimpo}`
  const blob = await put(filename, file, { access: 'public' })
  return NextResponse.json({
    url: blob.url,
    nome: file.name,
    tamanho: file.size,
  })
}
