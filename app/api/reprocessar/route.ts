import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { Extrato, Lancamento } from '@/lib/types'
import { validarPlaca, normalizarPlaca, setFrota, FROTA_PADRAO } from '@/lib/frota'

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json()

    // Carregar frota atualizada do Redis
    const frotaAtual = await redis.get('frota') as any[] | null
    if (frotaAtual && frotaAtual.length > 0) setFrota(frotaAtual)
    else setFrota(FROTA_PADRAO)

    const extratos: Extrato[] = await redis.get('extratos') || []
    const idx = extratos.findIndex(e => e.id === id)
    if (idx === -1) return NextResponse.json({ error: 'Extrato não encontrado' }, { status: 404 })

    const extrato = extratos[idx]

    // Reprocessar cada lançamento com a frota atual
    const postosAtualizados = extrato.postos.map(posto => {
      const lancamentosAtualizados: Lancamento[] = posto.lancamentos.map(l => {
        const validacao = validarPlaca(l.placaLida)
        return {
          ...l,
          status: validacao.status,
          nFrota: validacao.veiculo?.nFrota ?? l.nFrota,
          grupo: validacao.veiculo?.grupo ?? l.grupo,
          marca: validacao.veiculo?.marca ?? l.marca,
          modelo: validacao.veiculo?.modelo ?? l.modelo,
        }
      })

      const totalValor = lancamentosAtualizados.reduce((s, l) => s + l.valor, 0)
      const totalLitros = lancamentosAtualizados.reduce((s, l) => s + l.litros, 0)
      const placasUnicas = new Set(lancamentosAtualizados.map(l => normalizarPlaca(l.placaLida)))

      return {
        ...posto,
        lancamentos: lancamentosAtualizados,
        totalValor, totalLitros,
        totalVeiculos: placasUnicas.size,
      }
    })

    const totalValor = postosAtualizados.reduce((s, p) => s + p.totalValor, 0)
    const totalLitros = postosAtualizados.reduce((s, p) => s + p.totalLitros, 0)
    const todasPlacas = new Set(postosAtualizados.flatMap(p => p.lancamentos.map(l => normalizarPlaca(l.placaLida))))

    const todosLanc = postosAtualizados.flatMap(p => p.lancamentos)
    const alertas = {
      confirmada: todosLanc.filter(l => l.status === 'confirmada').length,
      confirmadaValor: todosLanc.filter(l => l.status === 'confirmada').reduce((s, l) => s + l.valor, 0),
      provavel: todosLanc.filter(l => l.status === 'provavel').length,
      provalValor: todosLanc.filter(l => l.status === 'provavel').reduce((s, l) => s + l.valor, 0),
      naoIdentificada: todosLanc.filter(l => l.status === 'nao_identificada').length,
      naoIdentificadaValor: todosLanc.filter(l => l.status === 'nao_identificada').reduce((s, l) => s + l.valor, 0),
    }

    extratos[idx] = {
      ...extrato,
      postos: postosAtualizados,
      totalValor, totalLitros,
      totalVeiculos: todasPlacas.size,
      alertas,
    }

    await redis.set('extratos', extratos)
    return NextResponse.json({ sucesso: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
