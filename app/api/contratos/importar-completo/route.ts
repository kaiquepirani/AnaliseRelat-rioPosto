import { NextRequest, NextResponse } from 'next/server'
import { requisicaoAutenticada } from '@/lib/contratos-auth'
import { get } from '@vercel/blob'

export const runtime = 'nodejs'
export const maxDuration = 60

const PROMPT = `Você está analisando um PDF que contém um CONTRATO de transporte firmado entre a ETCO Empresa de Turismo e Transporte Coletivo Ltda (CONTRATADA) e um órgão público (CONTRATANTE), e possivelmente também TERMOS DE ADITAMENTO desse mesmo contrato, todos em um único arquivo.

Seu trabalho é extrair TODAS as informações contratuais e organizar cronologicamente. Retorne APENAS um objeto JSON puro, sem markdown, sem crases, sem explicações.

Estrutura esperada:

{
  "contemAditamentos": true/false,
  "contrato": {
    "numero": "ex: '007/2024'",
    "contratante": "razão social completa (ex: 'Prefeitura Municipal de Aguaí')",
    "cnpjContratante": "CNPJ apenas números e pontuação (ex: '46.425.229/0001-79')",
    "cliente": "o mesmo que contratante, forma curta (ex: 'Prefeitura Municipal de Aguaí')",
    "cidade": "nome da cidade (ex: 'Aguaí')",
    "tipoServico": "'Transporte Escolar' | 'Transporte Saúde' | 'Fretamento' | 'Outro'",
    "processoAdministrativo": "ex: '152/2023'",
    "modalidadeLicitacao": "ex: 'Pregão Eletrônico nº 043/2023'",
    "dataInicio": "YYYY-MM-DD",
    "dataVencimento": "YYYY-MM-DD",
    "valorTotal": 1700111.70,
    "objeto": "resumo em até 300 caracteres",
    "clausulaReajuste": "texto curto da cláusula",
    "itens": [{"descricao": "Rota 01", "quantidade": 23730, "unidade": "km", "valorUnitario": 7.11, "valorTotal": 168720.30}]
  },
  "aditamentos": [
    {
      "numero": 1,
      "data": "YYYY-MM-DD",
      "tipo": "'reajuste' | 'acrescimo' | 'supressao' | 'prorrogacao' | 'misto'",
      "novaDataVencimento": "YYYY-MM-DD ou null",
      "novoValorTotal": 1777314.00,
      "percentualReajuste": 4.56,
      "indiceReajuste": "'IPCA' | 'IGP-M' | 'INPC' | null",
      "observacoes": "resumo em até 300 caracteres",
      "itensResultantes": [{"descricao": "Rota 01", "quantidade": 23730, "unidade": "km", "valorUnitario": 7.43, "valorTotal": 176313.90}]
    }
  ]
}

REGRAS:
1. Aditamentos em ordem cronológica (mais antigo primeiro).
2. itensResultantes: LISTA COMPLETA de itens vigentes APÓS cada aditamento (inclusive os que não mudaram).
3. Tipo: "reajuste"=só valores; "acrescimo"=itens novos; "supressao"=removeu; "prorrogacao"=só prazo; "misto"=combinação.
4. Valores decimais (ponto), sem R$, sem milhar.
5. Datas YYYY-MM-DD. Ignore assinaturas digitais.
6. Sem aditamentos: contemAditamentos=false, aditamentos=[].
7. Campos não identificados: null.
8. NÃO invente dados.

Responda APENAS o JSON.`

const TIPOS_ADITAMENTO = ['reajuste', 'acrescimo', 'supressao', 'prorrogacao', 'misto']
const TIPOS_SERVICO = ['Transporte Escolar', 'Transporte Saúde', 'Fretamento', 'Outro']
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

const dataOuNull = (v: any): string | null =>
  typeof v === 'string' && REGEX_DATA.test(v) ? v : null

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

  // Lê body JSON com a URL do Blob (arquivo já foi enviado antes)
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ erro: 'Body inválido' }, { status: 400 })
  }

  const blobUrl = body?.blobUrl
  if (!blobUrl || typeof blobUrl !== 'string') {
    return NextResponse.json({ erro: 'blobUrl ausente' }, { status: 400 })
  }

  // Baixa o PDF do Blob
  let base64: string
  try {
    const result = await get(blobUrl, { access: 'private' })
    if (!result || !result.stream) {
      return NextResponse.json({ erro: 'Arquivo não encontrado no Blob' }, { status: 404 })
    }
    const chunks: Buffer[] = []
    const reader = result.stream.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(Buffer.from(value))
    }
    base64 = Buffer.concat(chunks).toString('base64')
  } catch (e: any) {
    return NextResponse.json(
      { erro: 'Falha ao ler arquivo do armazenamento', detalhe: String(e?.message || e).slice(0, 300) },
      { status: 500 },
    )
  }

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
        max_tokens: 16000,
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
        { erro: 'Falha ao chamar a IA', detalhe: detalhe.slice(0, 500) },
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
      return NextResponse.json(
        { erro: 'IA não retornou JSON válido', textoBruto: textoBloco.text.slice(0, 500) },
        { status: 500 },
      )
    }

    const c = parsed.contrato || null
    const contrato = c ? {
      numero: str(c.numero, 50),
      contratante: str(c.contratante, 200),
      cnpjContratante: str(c.cnpjContratante, 25),
      cliente: str(c.cliente, 200) || str(c.contratante, 200),
      cidade: str(c.cidade, 100),
      tipoServico: TIPOS_SERVICO.indexOf(c.tipoServico) !== -1 ? c.tipoServico : 'Transporte Escolar',
      processoAdministrativo: str(c.processoAdministrativo, 50),
      modalidadeLicitacao: str(c.modalidadeLicitacao, 100),
      dataInicio: dataOuNull(c.dataInicio),
      dataVencimento: dataOuNull(c.dataVencimento),
      valorTotal: num(c.valorTotal),
      objeto: str(c.objeto, 500),
      clausulaReajuste: str(c.clausulaReajuste, 300),
      itens: normalizarItens(c.itens),
    } : null

    const aditamentosRaw = Array.isArray(parsed.aditamentos) ? parsed.aditamentos : []
    const aditamentos = aditamentosRaw
      .map((a: any, idx: number) => ({
        numero: Number(a?.numero) || (idx + 1),
        data: dataOuNull(a?.data),
        tipo: TIPOS_ADITAMENTO.indexOf(a?.tipo) !== -1 ? a.tipo : 'misto',
        novaDataVencimento: dataOuNull(a?.novaDataVencimento),
        novoValorTotal: num(a?.novoValorTotal),
        percentualReajuste: num(a?.percentualReajuste),
        indiceReajuste: str(a?.indiceReajuste, 20),
        observacoes: str(a?.observacoes, 300),
        itensResultantes: normalizarItens(a?.itensResultantes),
      }))
      .filter((a: any) => a.data)
      .sort((a: any, b: any) => a.data.localeCompare(b.data))
      .map((a: any, idx: number) => ({ ...a, numero: idx + 1 }))

    const contemAditamentos = aditamentos.length > 0

    return NextResponse.json({
      ok: true,
      contemAditamentos,
      contrato,
      aditamentos,
    })
  } catch (e: any) {
    return NextResponse.json(
      { erro: 'Falha ao processar', detalhe: String(e?.message || e).slice(0, 400) },
      { status: 500 },
    )
  }
}
