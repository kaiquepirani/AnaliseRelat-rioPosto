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
          {
            type: 'text',
            text: `Extraia TODOS os dados deste extrato de posto de combustível e retorne APENAS um JSON válido, sem texto adicional, sem markdown, sem blocos de código.

O JSON deve ter exatamente este formato:
{
  "posto": {
    "nome": "nome do posto",
    "cnpj": "cnpj",
    "periodo": "periodo do extrato ex: 01/04/2024 a 15/04/2024"
  },
  "lancamentos": [
    {
      "documento": "ST.90993-0",
      "emissao": "31/03/24",
      "vencimento": "30/04/24",
      "placa": "EJV-1I15",
      "km": 162204,
      "itens": "DIE,PRO",
      "litros": 162.204,
      "vlrUnitario": 5.690,
      "valor": 974.06
    }
  ]
}

Regras:
- km deve ser numero inteiro (null se nao disponivel)
- litros, vlrUnitario e valor devem ser numeros decimais com ponto
- valor sem pontos de milhar (ex: 1774.28 e nao 1.774,28)
- itens e a string de combustiveis como aparece no extrato
- Extraia TODAS as linhas sem excecao`
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
      const itens = (l.itens || '').toUpperCase()
      const codigoComb = Object.keys(COMBUSTIVEIS).find(k => itens.includes(k)) || itens.split(',')[0] || 'OUT'
      return {
        documento: l.documento || '',
        emissao: l.emissao || '',
        vencimento: l.vencimento || '',
        placaLida: l.placa || '',
        placaCorrigida: validacao.placaCorrigida,
        km: l.km || undefined,
        combustivel: codigoComb,
        combustivelNome: COMBUSTIVEIS[codigoComb] || codigoComb,
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
      naoIdentificadaValor: lancamentos.filter(l => l.status === 'nao_identificada').reduce((s, l) => s + l.valor, 0),
    }

    const kmVeiculos: Record<string, { kmAtual: number; mediaPeriodo?: number }> = {}
    lancamentos.forEach(l => {
      if (l.km && l.placaLida) {
        const key = normalizarPlaca(l.placaLida)
        if (!kmVeiculos[key] || l.km > kmVeiculos[key].kmAtual) kmVeiculos[key] = { kmAtual: l.km }
      }
    })

    const extratosAnteriores: Extrato[] = await redis.get('extratos') || []
    extratosAnteriores.forEach(ext => {
      Object.entries(ext.kmVeiculos || {}).forEach(([placa, dados]) => {
        if (kmVeiculos[placa] && dados.kmAtual) {
          const diff = kmVeiculos[placa].kmAtual - dados.kmAtual
          if (diff > 0) kmVeiculos[placa].mediaPeriodo = diff
        }
      })
    })

    const posto: ResumoPosto = {
      nome: dadosBrutos.posto?.nome || file.name,
      cnpj: dadosBrutos.posto?.cnpj || '',
      totalValor, totalLitros,
      totalVeiculos: placasUnicas.size,
      porCombustivel, lancamentos,
    }

    const novoExtrato: Extrato = {
      id: randomUUID(),
      arquivo: file.name,
      dataUpload: new Date().toISOString(),
      periodo: dadosBrutos.posto?.periodo || '',
      postos: [posto],
      totalValor, totalLitros,
      totalVeiculos: placasUnicas.size,
      alertas, kmVeiculos,
    }

    await redis.set('extratos', [...extratosAnteriores, novoExtrato])
    return NextResponse.json({ sucesso: true, extrato: novoExtrato })
  } catch (err: any) {
    console.error('Erro geral:', err.message)
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 })
  }
}
