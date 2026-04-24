import { NextRequest, NextResponse } from 'next/server'
import { requisicaoAutenticada } from '@/lib/contratos-auth'

export const runtime = 'nodejs'
export const maxDuration = 60

const PROMPT_CONTRATO = `Extraia APENAS os dados do CONTRATO ORIGINAL deste PDF (ignore termos de aditamento/apostilamento, se houver).

Retorne APENAS um objeto JSON puro, sem markdown, sem crases, sem explicações:

{
  "numero": "número do contrato",
  "contratante": "razão social completa",
  "cnpjContratante": "CNPJ com pontuação",
  "cliente": "mesmo que contratante (forma curta)",
  "cidade": "nome da cidade",
  "tipoServico": "'Transporte Escolar' | 'Transporte Saúde' | 'Fretamento' | 'Outro'",
  "processoAdministrativo": "número do processo",
  "modalidadeLicitacao": "ex: 'Pregão Eletrônico nº X/YYYY'",
  "dataInicio": "YYYY-MM-DD",
  "dataVencimento": "YYYY-MM-DD (12 meses após início, salvo indicação em contrário)",
  "valorTotal": 1700111.70,
  "objeto": "resumo em até 250 caracteres",
  "clausulaReajuste": "texto curto da cláusula",
  "itens": [{"descricao": "Rota 01", "quantidade": 23730, "unidade": "km", "valorUnitario": 7.11, "valorTotal": 168720.30}]
}

REGRAS:
- Foco APENAS na primeira tabela de valores (do contrato nativo)
- Se não encontrar algum campo, retorne null
- Valores decimais (ponto), sem R$, sem milhar
- Datas YYYY-MM-DD
- Ignore datas de assinatura digital
- NÃO invente dados

Responda APENAS o JSON.`

const PROMPT_ADITAMENTOS = `Extraia APENAS os TERMOS DE ADITAMENTO e APOSTILAMENTOS deste PDF (ignore o contrato original).

Cada aditamento é um evento cronológico que alterou o contrato.

Retorne APENAS um JSON puro (sem markdown), em ordem cronológica (mais antigo primeiro):

{
  "aditamentos": [
    {
      "numero": 1,
      "data": "YYYY-MM-DD",
      "tipo": "'reajuste' | 'acrescimo' | 'supressao' | 'prorrogacao' | 'misto'",
      "novaDataVencimento": "YYYY-MM-DD ou null",
      "novoValorTotal": número ou null,
      "percentualReajuste": número ou null,
      "indiceReajuste": "IPCA/IGP-M/INPC ou null",
      "observacoes": "resumo em até 200 caracteres",
      "itensResultantes": [{"descricao": "Rota 01", "quantidade": 23730, "unidade": "km", "valorUnitario": 7.43, "valorTotal": 176313.90}]
    }
  ]
}

REGRAS:
- Se o PDF não tem aditamentos/apostilamentos, retorne {"aditamentos": []}
- itensResultantes: lista COMPLETA de itens após o aditamento
- Apostilamentos contam como aditamentos do tipo "reajuste"
- Aditamento que só prorroga o prazo: tipo "prorrogacao"
- Se valores "já corrigidos por apostilamento" e há tabela: use esses valores e tipo "reajuste"
- Valores decimais (ponto), sem R$, sem milhar
- NÃO invente dados

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

const chamarIA = async (apiKey: string, base64: string, prompt: string, maxTokens: number): Promise<any> => {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  })
  if (!resp.ok) {
    const detalhe = await resp.text()
    throw new Error(`IA: ${detalhe.slice(0, 300)}`)
  }
  const data = await resp.json()
  const blocos = Array.isArray(data.content) ? data.content : []
  const textoBloco = blocos.find((b: any) => b && b.type === 'text')
  if (!textoBloco || typeof textoBloco.text !== 'string') throw new Error('Resposta vazia da IA')
  try {
    return JSON.parse(limparTexto(textoBloco.text))
  } catch {
    throw new Error(`JSON inválido: ${textoBloco.text.slice(0, 200)}`)
  }
}

export async function POST(req: NextRequest) {
  if (!requisicaoAutenticada(req)) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ erro: 'ANTHROPIC_API_KEY ausente' }, { status: 500 })
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ erro: 'Body inválido' }, { status: 400 })
  }

  const blobUrl = body?.blobUrl
  if (!blobUrl || typeof blobUrl !== 'string') {
    return NextResponse.json({ erro: 'blobUrl ausente' }, { status: 400 })
  }

  // Baixa o PDF diretamente da URL pública do Blob
  let base64: string
  try {
    const resp = await fetch(blobUrl)
    if (!resp.ok) {
      return NextResponse.json({ erro: 'Falha ao baixar PDF do Blob', status: resp.status }, { status: 500 })
    }
    const buf = Buffer.from(await resp.arrayBuffer())
    base64 = buf.toString('base64')
  } catch (e: any) {
    return NextResponse.json(
      { erro: 'Falha ao ler arquivo', detalhe: String(e?.message || e).slice(0, 300) },
      { status: 500 },
    )
  }

  try {
    const [resContrato, resAditamentos] = await Promise.all([
      chamarIA(apiKey, base64, PROMPT_CONTRATO, 6000).catch(e => ({ __erro: e.message })),
      chamarIA(apiKey, base64, PROMPT_ADITAMENTOS, 10000).catch(e => ({ __erro: e.message })),
    ])

    if ((resContrato as any)?.__erro && (resAditamentos as any)?.__erro) {
      return NextResponse.json({
        erro: 'IA falhou',
        detalhe: `Contrato: ${(resContrato as any).__erro}. Aditamentos: ${(resAditamentos as any).__erro}`,
      }, { status: 500 })
    }

    const c = (resContrato as any)?.__erro ? null : resContrato
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

    const aditamentosRaw = (resAditamentos as any)?.__erro
      ? []
      : (Array.isArray((resAditamentos as any)?.aditamentos) ? (resAditamentos as any).aditamentos : [])

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

    return NextResponse.json({
      ok: true,
      contemAditamentos: aditamentos.length > 0,
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
