import { NextRequest, NextResponse } from 'next/server'
import { requisicaoAutenticada } from '@/lib/contratos-auth'

export const runtime = 'nodejs'
export const maxDuration = 60

const LIMITE_BYTES = 15 * 1024 * 1024

const PROMPT = `Você está analisando um contrato entre a ETCO Empresa de Turismo e Transporte Coletivo Ltda (CONTRATADA) e um órgão público (CONTRATANTE, geralmente uma prefeitura).

Extraia os dados do contrato e retorne APENAS um objeto JSON puro (sem markdown, sem crases, sem explicações):

{
  "numero": "ex: '007/2024'",
  "contratante": "razão social completa (ex: 'Prefeitura Municipal de Aguaí')",
  "cnpjContratante": "CNPJ com pontuação (ex: '46.425.229/0001-79')",
  "cliente": "forma curta, geralmente igual ao contratante (ex: 'Prefeitura Municipal de Aguaí')",
  "cidade": "apenas o nome da cidade (ex: 'Aguaí')",
  "tipoServico": "'Transporte Escolar' | 'Transporte Saúde' | 'Fretamento' | 'Outro'",
  "processoAdministrativo": "ex: '152/2023'",
  "modalidadeLicitacao": "ex: 'Pregão Eletrônico nº 043/2023'",
  "dataInicio": "YYYY-MM-DD (assinatura do contrato)",
  "dataVencimento": "YYYY-MM-DD (geralmente 12 meses após início)",
  "valorMensal": número ou null,
  "valorTotal": número (valor global do contrato, ex: 1700111.70),
  "objeto": "resumo em até 300 caracteres",
  "clausulaReajuste": "texto curto da cláusula (ex: 'IPCA/IBGE acumulado 12 meses')",
  "itens": [
    {
      "descricao": "ex: 'Rota 01'",
      "quantidade": 23730,
      "unidade": "km",
      "valorUnitario": 7.11,
      "valorTotal": 168720.30
    }
  ]
}

REGRAS:
- Valores sempre como número decimal (ponto), sem R$, sem separador de milhar
- Datas sempre YYYY-MM-DD
- Ignore datas de assinatura digital, use as do corpo do documento
- Para itens: liste TODAS as rotas/itens encontrados na tabela de valores
- Se um campo não for identificado, retorne null
- NÃO invente dados

Responda APENAS o JSON.`

const TIPOS_VALIDOS = ['Transporte Escolar', 'Transporte Saúde', 'Fretamento', 'Outro']
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
        max_tokens: 8000,
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
      numero: str(parsed.numero, 50),
      contratante: str(parsed.contratante, 200),
      cnpjContratante: str(parsed.cnpjContratante, 25),
      cliente: str(parsed.cliente, 200) || str(parsed.contratante, 200),
      cidade: str(parsed.cidade, 100),
      tipoServico: TIPOS_VALIDOS.indexOf(parsed.tipoServico) !== -1 ? parsed.tipoServico : null,
      processoAdministrativo: str(parsed.processoAdministrativo, 50),
      modalidadeLicitacao: str(parsed.modalidadeLicitacao, 100),
      dataInicio: typeof parsed.dataInicio === 'string' && REGEX_DATA.test(parsed.dataInicio) ? parsed.dataInicio : null,
      dataVencimento: typeof parsed.dataVencimento === 'string' && REGEX_DATA.test(parsed.dataVencimento) ? parsed.dataVencimento : null,
      valorMensal: num(parsed.valorMensal),
      valorTotal: num(parsed.valorTotal),
      objeto: str(parsed.objeto, 500),
      clausulaReajuste: str(parsed.clausulaReajuste, 300),
      itens: normalizarItens(parsed.itens),
    }

    return NextResponse.json({ ok: true, dados })
  } catch (e: any) {
    return NextResponse.json(
      { erro: 'Falha ao processar', detalhe: String(e?.message || e).slice(0, 400) },
      { status: 500 },
    )
  }
}
