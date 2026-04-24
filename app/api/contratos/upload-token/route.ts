import { NextRequest, NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { requisicaoAutenticada, tokenDaRequest } from '@/lib/contratos-auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sessao = tokenDaRequest(req)
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const body = (await req.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => {
        return {
          allowedContentTypes: ['application/pdf'],
          maximumSizeInBytes: 25 * 1024 * 1024, // 25 MB
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ sessao }),
        }
      },
      onUploadCompleted: async () => {
        // Opcional: webhook pós-upload
      },
    })
    return NextResponse.json(jsonResponse)
  } catch (error: any) {
    return NextResponse.json(
      { erro: 'Falha ao gerar token de upload', detalhe: String(error?.message || error).slice(0, 300) },
      { status: 500 },
    )
  }
}
