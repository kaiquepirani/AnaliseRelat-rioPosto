import { NextRequest, NextResponse } from 'next/server'
import { requisicaoAutenticada } from '@/lib/contratos-auth'

export const runtime = 'nodejs'
export const maxDuration = 60

const LIMITE_BYTES = 10 * 1024 * 1024

const PROMPT = `Você está analisando um TERMO DE ADITAMENTO de um contrato entre a ETCO Empresa de Turismo e Transporte Coletivo Ltda e uma prefeitura ou cliente.

Um termo de aditamento geralmente estende o prazo de vigência, altera o valor do contrato, ou ambos.

Extraia os seguintes dados e retorne APENAS um objeto JSON puro (sem markdown, sem crases, sem explicações):

{
  "data": "data em que o aditamento foi assinado, no formato YYYY-MM-DD",
  "novaDataVencimento": "nova data de vencimento do contrato após o aditamento, no formato YYYY-MM-DD. Se o aditamento não altera o prazo, retorne null",
  "novoValorMensal": "novo valor mensal em reais após o aditamento, apenas número (ex.: 48000 ou 48000.50). Se não alterar o valor mensal, retorne null",
  "novoValorTotal": "novo valor total do contrato após o aditamento, apenas número. Se não alterar, retorne null",
  "observacoes": "resumo curto do que foi alterado neste aditamento, em no máximo 200 caracteres"
}

Se algum campo não for identificado com certeza, retorne null. Não invente dados.
Responda APENAS com o JSON puro.`

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/

const limparTexto = (s: string): string => {
  let t = s.trim()
  t = t.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '')
  return t.trim()
}

const normalizarNumero = (v: any): number | null => {
  if (v == null) return null
  const s = String(v).replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  if (isNaN(n) || n <= 0) return null
  return n
}

export async function POST(req: NextRequest) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ erro: 'ANTHROPIC_API_KEY ausente' }, { status: 500 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ erro: 'Arquivo não enviado' }, { status: 400 })
  }
  if (file.size > LIMITE_BYTES) {
    return NextResponse.json({ erro: 'Arquivo muito grande' }, { status: 413 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const base64 = buffer.toString('base64')

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    })

    if (!resp.ok) {
      const detalhe = await resp.text()
      return NextResponse.json(
        { erro: 'Falha ao chamar a IA', detalhe: detalhe.slice(0, 400) },
        { status: 500 },
      )
    }

    const data = await resp.json()
    const blocos = Array.isArray(data.content) ? data.content : []
    const textoBloco = blocos.find((b: any) => b && b.type === 'text')
    if (!textoBloco || typeof textoBloco.text !== 'string') {
      return NextResponse.json({ erro: 'Resposta vazia da IA' }, { status: 500 })
    }

    let parsed: any
    try {
      parsed = JSON.parse(limparTexto(textoBloco.text))
    } catch {
      return NextResponse.json({ erro: 'IA não retornou JSON válido' }, { status: 500 })
    }

    const dados = {
      data: typeof parsed.data === 'string' && REGEX_DATA.test(parsed.data) ? parsed.data : null,
      novaDataVencimento: typeof parsed.novaDataVencimento === 'string' && REGEX_DATA.test(parsed.novaDataVencimento) ? parsed.novaDataVencimento : null,
      novoValorMensal: normalizarNumero(parsed.novoValorMensal),
      novoValorTotal: normalizarNumero(parsed.novoValorTotal),
      observacoes: typeof parsed.observacoes === 'string' && parsed.observacoes.trim() ? parsed.observacoes.trim().slice(0, 500) : null,
    }

    return NextResponse.json({ ok: true, dados })
  } catch (e: any) {
    return NextResponse.json(
      { erro: 'Falha ao processar', detalhe: String(e?.message || e).slice(0, 400) },
      { status: 500 },
    )
  }
}
