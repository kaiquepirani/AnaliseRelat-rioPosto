'use client'

import { PDFDocument } from 'pdf-lib'

// A4 em pontos (1 ponto = 1/72 polegada)
const A4_WIDTH = 595.28
const A4_HEIGHT = 841.89

// Limite alvo após compressão
const TAMANHO_ALVO_BYTES = 3.8 * 1024 * 1024  // 3.8 MB (margem segura abaixo dos 4 MB do Vercel Hobby)

interface ResultadoCompressao {
  arquivoComprimido: File
  reducao: number  // 0 a 1 (ex: 0.85 = reduziu 85%)
  tamanhoOriginal: number
  tamanhoFinal: number
  cabeNoLimite: boolean
}

// Configura PDF.js worker (precisa ser feito uma vez)
let pdfJsConfigured = false
const configurarPdfJs = async (): Promise<any> => {
  const pdfjs: any = await import('pdfjs-dist')
  if (!pdfJsConfigured) {
    // Usa CDN como worker para evitar dor de cabeça com bundling no Next.js
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`
    pdfJsConfigured = true
  }
  return pdfjs
}

/**
 * Comprime um PDF renderizando cada página como imagem JPEG e remontando.
 * Padroniza tudo pra A4 retrato.
 *
 * @param file Arquivo PDF original
 * @param qualidadeJpeg Qualidade JPEG de 0 a 1 (default 0.7)
 * @param dpi Resolução de renderização em DPI (default 110)
 */
export const comprimirPdf = async (
  file: File,
  qualidadeJpeg = 0.7,
  dpi = 110,
): Promise<ResultadoCompressao> => {
  const tamanhoOriginal = file.size
  const pdfjs = await configurarPdfJs()

  // Lê o PDF original
  const buffer = await file.arrayBuffer()
  const pdfDoc = await pdfjs.getDocument({ data: buffer }).promise
  const numPaginas = pdfDoc.numPages

  // Cria novo PDF de saída (com pdf-lib)
  const novoPdf = await PDFDocument.create()

  // Escala de renderização: 72 DPI é o padrão PDF, então (dpi/72) é o multiplicador
  const escala = dpi / 72

  for (let i = 1; i <= numPaginas; i++) {
    const pagina = await pdfDoc.getPage(i)
    const viewport = pagina.getViewport({ scale: escala })

    // Cria canvas para renderizar a página
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(viewport.width)
    canvas.height = Math.floor(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Falha ao criar canvas 2D')

    // Renderiza a página no canvas
    await pagina.render({ canvasContext: ctx, viewport }).promise

    // Converte canvas em JPEG comprimido
    const blobJpeg = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        b => b ? resolve(b) : reject(new Error('Falha ao gerar JPEG')),
        'image/jpeg',
        qualidadeJpeg,
      )
    })

    const arrayBufferJpeg = await blobJpeg.arrayBuffer()
    const jpegImage = await novoPdf.embedJpg(arrayBufferJpeg)

    // Adiciona como página A4, ajustando proporção
    const novaPagina = novoPdf.addPage([A4_WIDTH, A4_HEIGHT])
    const dimensoesImg = jpegImage.scale(1)
    const escalaX = A4_WIDTH / dimensoesImg.width
    const escalaY = A4_HEIGHT / dimensoesImg.height
    const escalaFinal = Math.min(escalaX, escalaY)
    const novoLargura = dimensoesImg.width * escalaFinal
    const novaAltura = dimensoesImg.height * escalaFinal
    const x = (A4_WIDTH - novoLargura) / 2
    const y = (A4_HEIGHT - novaAltura) / 2

    novaPagina.drawImage(jpegImage, {
      x, y, width: novoLargura, height: novaAltura,
    })

    // Limpa o canvas pra liberar memória
    canvas.width = 0
    canvas.height = 0
  }

  // Serializa o novo PDF
  const bytesNovoPdf = await novoPdf.save()
  const arquivoComprimido = new File(
    [bytesNovoPdf],
    file.name.replace(/\.pdf$/i, '_comprimido.pdf'),
    { type: 'application/pdf' },
  )

  const tamanhoFinal = arquivoComprimido.size
  const reducao = 1 - (tamanhoFinal / tamanhoOriginal)
  const cabeNoLimite = tamanhoFinal <= TAMANHO_ALVO_BYTES

  return {
    arquivoComprimido,
    reducao,
    tamanhoOriginal,
    tamanhoFinal,
    cabeNoLimite,
  }
}

/**
 * Tenta comprimir progressivamente até caber no limite.
 * Estratégia: começa com qualidade alta, vai reduzindo se necessário.
 */
export const comprimirAteCaber = async (
  file: File,
  onProgresso?: (mensagem: string) => void,
): Promise<ResultadoCompressao> => {
  const tentativas = [
    { qualidade: 0.75, dpi: 120 },
    { qualidade: 0.65, dpi: 110 },
    { qualidade: 0.55, dpi: 100 },
    { qualidade: 0.45, dpi: 90 },
  ]

  let melhorResultado: ResultadoCompressao | null = null

  for (let i = 0; i < tentativas.length; i++) {
    const { qualidade, dpi } = tentativas[i]
    if (onProgresso) {
      onProgresso(`Comprimindo PDF (tentativa ${i + 1}/${tentativas.length})...`)
    }

    try {
      const resultado = await comprimirPdf(file, qualidade, dpi)
      melhorResultado = resultado
      if (resultado.cabeNoLimite) {
        return resultado
      }
    } catch (e: any) {
      // Se falhou, tenta próxima qualidade
      console.error(`Tentativa ${i + 1} falhou:`, e?.message)
    }
  }

  if (!melhorResultado) {
    throw new Error('Não foi possível comprimir o PDF. Pode estar corrompido.')
  }

  return melhorResultado
}

export const formatarTamanho = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
