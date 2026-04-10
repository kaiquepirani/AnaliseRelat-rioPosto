import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { validarPlaca, normalizarPlaca } from '@/lib/frota'
import { kv } from '@vercel/kv'
import { Extrato, Lancamento, ResumoPosto } from '@/lib/types'
import { randomUUID } from 'crypto'

const client = new Anthropic()

const COMBUSTIVEIS: Record<string, string> = {
  '10C': 'Etanol',
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

    const resposta = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 }
          },
          {
            type: 'text',
            text: `Extraia TODOS os dados deste extrato de posto de combustível e retorne APENAS um JSON válido, sem texto adicional, sem markdown, sem blocos de código.

O JSON deve ter exatamente este formato:
{
  "posto": {
    "nome": "nome do posto",
    "cnpj": "cnpj",
    "periodo": "período do extrato ex: 01/04/2024 a 15/04/2024"
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
- km deve ser número inteiro (null se não disponível)
- litros e vlrUnitario devem ser números decimais com ponto
- valor deve ser número decimal com ponto (sem pontos de milhar)
- itens é a string de combustíveis como aparece no extrato
- Extraia TODAS as linhas, sem exceção`
          }
        ]
      }]
    })

    const textoResposta = resposta.content[0].type === 'text' ? resposta.content[0].text : ''
    let dadosBrutos: any

    try {
      const cleaned = textoResposta.replace(/```json|```/g, '').trim()
      dadosBrutos = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'Falha ao interpretar resposta do Claude', raw: textoResposta }, { status: 500 })
    }

    const lancamentos: Lancamento[] = (dadosBrutos.lancamentos || []).map((l: any) => {
      const validacao = validarPlaca(l.placa || '')
      const itens = (l.itens || '').toUpperCase()
      const codigoComb = Object.keys(COMBUSTIVEIS).find(k => itens.includes(k)) || itens.split(',')[0] || 'OUT'
      const combustivelNome = COMBUSTIVEIS[codigoComb] || codigoComb

      return {
        documento: l.documento || '',
        emissao: l.emissao || '',
        vencimento: l.vencimento || '',
        placaLida: l.placa || '',
        placaCorrigida: validacao.placaCorrigida,
        km: l.km || undefined,
        combustivel: codigoComb,
        combustivelNome,
        litros: parseFloat(l.litros) || 0,
        vlrUnitario: parseFloat(l.vlrUnitario) || 0,
        valor: parseFloat(l.valor) || 0,
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
        if (!kmVeiculos[key] || l.km > kmVeiculos[key].kmAtual) {
          kmVeiculos[key] = { kmAtual: l.km }
        }
      }
    })

    const extratosAnteriores: Extrato[] = await kv.get('extratos') || []
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
      totalValor,
      totalLitros,
      totalVeiculos: placasUnicas.size,
      porCombustivel,
      lancamentos,
    }

    const novoExtrato: Extrato = {
      id: randomUUID(),
      arquivo: file.name,
      dataUpload: new Date().toISOString(),
      periodo: dadosBrutos.posto?.periodo || '',
      postos: [posto],
      totalValor,
      totalLitros,
      totalVeiculos: placasUnicas.size,
      alertas,
      kmVeiculos,
    }

    const atualizados = [...extratosAnteriores, novoExtrato]
    await kv.set('extratos', atualizados)

    return NextResponse.json({ sucesso: true, extrato: novoExtrato })
  } catch (err: any) {
    console.error(err)
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 })
  }
}
