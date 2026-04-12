import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { validarPlaca, normalizarPlaca } from '@/lib/frota'
import { redis } from '@/lib/redis'
import { Extrato, Lancamento, ResumoPosto } from '@/lib/types'
import { randomUUID } from 'crypto'

const client = new Anthropic()

const COMBUSTIVEIS: Record<string, string> = {
  '10C': 'Diesel S10',
  'DIE': 'Diesel',
  'GAA': 'Gasolina',
  'PRO': 'Produto/Aditivo',
  'ETA': 'Etanol Aditivado',
  'GCA': 'Gasolina Comum',
  'DIESEL S10': 'Diesel S10',
  'OLEO DIESEL B S10': 'Diesel S10',
  'OLEO DIESEL S10': 'Diesel S10',
  'DIESEL': 'Diesel',
  'GASOLINA TIPO C': 'Gasolina',
  'GASOLINA COMUM': 'Gasolina',
  'GASOLINA': 'Gasolina',
  'ETANOL': 'Etanol',
  'ETANOL HIDRA': 'Etanol',
  'ETANOL ADITIVADO': 'Etanol Aditivado',
  'GNV': 'GNV',
}

function mapearCombustivel(itens: string): { codigo: string; nome: string } {
  const upper = itens.toUpperCase().trim()
  // Busca exata primeiro
  for (const [key, nome] of Object.entries(COMBUSTIVEIS)) {
    if (upper === key) return { codigo: key, nome }
  }
  // Busca por conteúdo
  for (const [key, nome] of Object.entries(COMBUSTIVEIS)) {
    if (upper.includes(key)) return { codigo: key, nome }
  }
  return { codigo: upper.split(',')[0] || 'OUT', nome: itens }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('pdf') as File
    if (!file) return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')

    console.log('PDF recebido:', file.name, 'tamanho base64:', base64.length)

    const messageParams: any = {
      model: 'claude-sonnet-4-5',
      max_tokens: 32000,
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
          {
            type: 'text',
            text: `Extraia TODOS os lancamentos deste extrato de posto de combustivel e retorne APENAS um JSON valido, sem texto adicional, sem markdown, sem blocos de codigo.

Este extrato pode ter diferentes formatos. Identifique o formato e extraia os dados corretamente:

FORMATO 1 (colunas: Documento, Emissao, Vencimento, Placa, KM, Itens, Litros, Vlr.Unitario, Valor):
- Extraia cada linha como um lancamento

FORMATO 2 (colunas: Data, TN, Motorista, Placa, Marca, KM, Nro.Doc, Qtde, Descricao, Valor):
- A descricao contem o tipo de combustivel e o preco por litro (ex: "OLEO DIESEL B S10 COMUM R$ 7,630/L")
- Extraia o tipo de combustivel da descricao
- Extraia o preco por litro da descricao
- O valor ja e o total do lancamento
- Litros = valor / preco_unitario (calcule se necessario)

O JSON deve ter exatamente este formato:
{
  "posto": {
    "nome": "nome do posto",
    "cnpj": "cnpj",
    "periodo": "01/03/2026 a 31/03/2026"
  },
  "lancamentos": [
    {
      "documento": "000028918",
      "emissao": "02/03/26",
      "vencimento": "",
      "placa": "BRY3I78",
      "km": null,
      "itens": "GASOLINA TIPO C",
      "litros": 19.079,
      "vlrUnitario": 6.390,
      "valor": 121.91
    }
  ]
}

Regras criticas:
- Extraia ABSOLUTAMENTE TODOS os lancamentos, sem pular nenhum
- km deve ser numero inteiro ou null se nao disponivel
- litros, vlrUnitario e valor devem ser numeros decimais com ponto (nao virgula)
- valor sem pontos de milhar (ex: 1774.28 e nao 1.774,28)
- placa sem hifens e sem espacos (ex: BRY3I78 nao BRY-3I78)
- Se houver linhas de TOTAL DA PLACA ou RESUMO, ignore-as, extraia apenas lancamentos individuais
- itens deve ser o tipo de produto/combustivel (ex: "GASOLINA TIPO C", "OLEO DIESEL S10", "ETANOL", "DIE", "10C")
- Se um lancamento tiver multiplos itens (ex: combustivel + oleo lubrificante), crie um lancamento para cada item separadamente`
          }
        ]
      }]
    }

    const resposta = await client.messages.create(messageParams)
    const textoResposta = resposta.content[0].type === 'text' ? resposta.content[0].text : ''
    
    console.log('Resposta Claude (primeiros 500 chars):', textoResposta.substring(0, 500))

    let dadosBrutos: any
    try {
      const cleaned = textoResposta.replace(/```json|```/g, '').trim()
      dadosBrutos = JSON.parse(cleaned)
      console.log('Lancamentos encontrados:', dadosBrutos?.lancamentos?.length || 0)
    } catch (e) {
      console.error('Erro ao parsear JSON:', e)
      return NextResponse.json({ error: 'Falha ao interpretar resposta', raw: textoResposta }, { status: 500 })
    }

    const parseValor = (v: any) => {
      if (typeof v === 'number') return v
      return parseFloat(String(v).replace(/\./g, '').replace(',', '.')) || 0
    }

    const lancamentos: Lancamento[] = (dadosBrutos.lancamentos || []).map((l: any) => {
      const validacao = validarPlaca(l.placa || '')
      const { codigo: codigoComb, nome: combustivelNome } = mapearCombustivel(l.itens || '')
      return {
        documento: l.documento || '',
        emissao: l.emissao || '',
        vencimento: l.vencimento || '',
        placaLida: l.placa || '',
        placaCorrigida: validacao.placaCorrigida,
        km: l.km || undefined,
        combustivel: codigoComb,
        combustivelNome,
        litros: parseValor(l.litros),
        vlrUnitario: parseValor(l.vlrUnitario),
        valor: parseValor(l.valor),
        status: validacao.status,
        nFrota: validacao.veiculo?.nFrota,
        grupo: validacao.veiculo?.grupo,
        marca: validacao.veiculo?.marca,
        modelo: validacao.veiculo?.modelo,
      }
    })

    const totalValor = lancamentos.reduce((s, l) => s + l.valor, 0)
    const totalLitros = lancamentos.reduce((s, l) => s + l.litros, 0)
    const placasUnicas = new Set(lancamentos.map(l => normalizarPlaca(l.placaLida)))

    const porCombustivel: Record<string, { valor: number; litros: number }> = {}
    lancamentos.forEach(l => {
      if (!porCombustivel[l.combustivelNome]) porCombustivel[l.combustivelNome] = { valor: 0, litros: 0 }
      porCombustivel[l.combustivelNome].valor += l.valor
      porCombustivel[l.combustivelNome].litros += l.litros
    })

    const alertas = {
      confirmada: lancamentos.filter(l => l.status === 'confirmada').length,
      confirmadaValor: lancamentos.filter(l => l.status === 'confirmada').reduce((s, l) => s + l.valor, 0),
      provavel: lancamentos.filter(l => l.status === 'provavel').length,
      provalValor: lancamentos.filter(l => l.status === 'provavel').reduce((s, l) => s + l.valor, 0),
      naoIdentificada: lancamentos.filter(l => l.status === 'nao_identificada').length,
