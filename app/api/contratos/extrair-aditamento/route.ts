import { NextRequest, NextResponse } from 'next/server'
import { requisicaoAutenticada } from '@/lib/contratos-auth'

export const runtime = 'nodejs'
export const maxDuration = 60

const LIMITE_BYTES = 15 * 1024 * 1024

const PROMPT = `Você está analisando um TERMO DE ADITAMENTO de um contrato entre a ETCO Empresa de Turismo e Transporte Coletivo Ltda e um órgão público (geralmente uma prefeitura).

Termos de aditamento geralmente fazem uma ou mais destas coisas:
- REAJUSTE: aplicam um percentual nos valores unitários (geralmente IPCA)
- ACRÉSCIMO: adicionam novos itens/rotas
- SUPRESSÃO: removem itens/rotas
- PRORROGAÇÃO: estendem o prazo
- MISTO: combinam várias dessas coisas

Extraia os dados e retorne APENAS um objeto JSON puro (sem markdown, sem crases):

{
  "numeroContrato": "número do contrato original ao qual este aditamento se refere (ex: '007/2024')",
  "data": "YYYY-MM-DD (data de assinatura do aditamento)",
  "tipo": "'reajuste' | 'acrescimo' | 'supressao' | 'prorrogacao' | 'misto'",
  "novaDataVencimento": "YYYY-MM-DD (nova data de término) ou null",
  "novoValorTotal": número (novo valor global do contrato após este aditamento) ou null,
  "percentualReajuste": número (ex: 4.56) ou null,
  "indiceReajuste": "'IPCA' | 'IGP-M' | 'INPC'" ou null,
  "observacoes": "resumo curto do que mudou, em até 300 caracteres",
  "itensResultantes": [
    {
      "descricao": "ex: 'Rota 01'",
      "quantidade": 23730,
      "unidade": "km",
      "valorUnitario": 7.43,
      "valorTotal": 176313.90
    }
  ]
}

REGRAS CRUCIAIS:

1. itensResultantes deve conter a LISTA COMPLETA DE ITENS VIGENTES APÓS este aditamento — mesmo itens que não mudaram. Ou seja: se havia 10 rotas e o aditamento só aplicou reajuste, retorne as 10 rotas com os valores novos. Se o aditamento adicionou 3 rotas novas a 10 existentes, retorne as 13.

2. Valores sempre em número decimal (ponto), sem R$, sem separador de milhar.

3. Datas sempre YYYY-MM-DD. Ignore datas de assinatura digital, use as do corpo do documento.

4. Se um campo não for identificado, retorne null.

5. NÃO invente dados.

Responda APENAS o JSON.`

const TIPOS_ADITAMENTO = ['reajuste', 'acrescimo', 'supressao', 'prorrogacao', 'misto']
const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/

const limparTexto = (s: string): string => {
  let t = s.trim()
  t = t.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```\s*$/, '')
  return t.trim()
}

const num = (v: any): number | null => {
  if (v == null) return null
  if (typeof v === 'number') return isNaN(v) ? null : v
  const s = String(v).replace(/\s/g, '').replace(/R\$/gi, '').replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return isNaN(n) ? null : n
}

const str = (v: any, limite = 500): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t) return null
  return t.slice(0, limite)
}

const normalizarItens = (lista: any): any[] => {
  if (!Array.isArray(lista)) return []
  return lista.map(it => ({
    descricao: str(it?.descricao, 200) || 'Item',
    quantidade: num(it?.quantidade) || undefined,
    unidade: str(it?.unidade, 30) || undefined,
    valorUnitario: num(it?.valorUnitario) || undefined,
    valorTotal: num(it?.valorTotal) || undefined,
  })).filter(it => it.descricao)
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
  if (!file) return NextResponse.json({ erro: 'Arquivo não enviado' }, { status: 400 })
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
        max_tokens: 6000,
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
      numeroContrato: str(parsed.numeroContrato, 50),
      data: typeof parsed.data === 'string' && REGEX_DATA.test(parsed.data) ? parsed.data : null,
      tipo: TIPOS_ADITAMENTO.indexOf(parsed.tipo) !== -1 ? parsed.tipo : 'misto',
      novaDataVencimento: typeof parsed.novaDataVencimento === 'string' && REGEX_DATA.test(parsed.novaDataVencimento) ? parsed.novaDataVencimento : null,
      novoValorTotal: num(parsed.novoValorTotal),
      percentualReajuste: num(parsed.percentualReajuste),
      indiceReajuste: str(parsed.indiceReajuste, 20),
      observacoes: str(parsed.observacoes, 300),
      itensResultantes: normalizarItens(parsed.itensResultantes),
    }

    return NextResponse.json({ ok: true, dados })
  } catch (e: any) {
    return NextResponse.json(
      { erro: 'Falha ao processar', detalhe: String(e?.message || e).slice(0, 400) },
      { status: 500 },
    )
  }
}
