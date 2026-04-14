import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { FrotaVeiculo, FROTA_PADRAO } from '@/lib/frota'

export async function GET() {
  const frotaRedis: FrotaVeiculo[] | null = await redis.get('frota')

  // Merge: Redis tem prioridade, mas garante que placas do FROTA_PADRAO ausentes sejam incluídas
  if (frotaRedis && frotaRedis.length > 0) {
    const placasRedis = new Set(frotaRedis.map(v => v.placa))
    const novasDoDefault = FROTA_PADRAO.filter(v => !placasRedis.has(v.placa))
    return NextResponse.json([...frotaRedis, ...novasDoDefault])
  }

  return NextResponse.json(FROTA_PADRAO)
}

export async function POST(req: NextRequest) {
  const veiculo: FrotaVeiculo = await req.json()
  const frotaRedis: FrotaVeiculo[] | null = await redis.get('frota')

  // Merge antes de adicionar
  let frota: FrotaVeiculo[]
  if (frotaRedis && frotaRedis.length > 0) {
    const placasRedis = new Set(frotaRedis.map(v => v.placa))
    const novasDoDefault = FROTA_PADRAO.filter(v => !placasRedis.has(v.placa))
    frota = [...frotaRedis, ...novasDoDefault]
  } else {
    frota = [...FROTA_PADRAO]
  }

  frota.push(veiculo)
  await redis.set('frota', frota)
  return NextResponse.json({ sucesso: true })
}

export async function PUT(req: NextRequest) {
  const { original, atualizado }: { original: FrotaVeiculo; atualizado: FrotaVeiculo } = await req.json()
  const frotaRedis: FrotaVeiculo[] | null = await redis.get('frota')

  // Merge antes de editar
  let frota: FrotaVeiculo[]
  if (frotaRedis && frotaRedis.length > 0) {
    const placasRedis = new Set(frotaRedis.map(v => v.placa))
    const novasDoDefault = FROTA_PADRAO.filter(v => !placasRedis.has(v.placa))
    frota = [...frotaRedis, ...novasDoDefault]
  } else {
    frota = [...FROTA_PADRAO]
  }

  const idx = frota.findIndex(v => v.placa === original.placa && v.nFrota === original.nFrota)
  if (idx === -1) return NextResponse.json({ error: 'Veículo não encontrado' }, { status: 404 })
  frota[idx] = atualizado
  await redis.set('frota', frota)
  return NextResponse.json({ sucesso: true })
}

export async function DELETE(req: NextRequest) {
  const { placa, nFrota }: { placa: string; nFrota: string } = await req.json()
  const frotaRedis: FrotaVeiculo[] | null = await redis.get('frota')

  // Merge antes de deletar
  let frota: FrotaVeiculo[]
  if (frotaRedis && frotaRedis.length > 0) {
    const placasRedis = new Set(frotaRedis.map(v => v.placa))
    const novasDoDefault = FROTA_PADRAO.filter(v => !placasRedis.has(v.placa))
    frota = [...frotaRedis, ...novasDoDefault]
  } else {
    frota = [...FROTA_PADRAO]
  }

  const filtrada = frota.filter(v => !(v.placa === placa && v.nFrota === nFrota))
  await redis.set('frota', filtrada)
  return NextResponse.json({ sucesso: true })
}
