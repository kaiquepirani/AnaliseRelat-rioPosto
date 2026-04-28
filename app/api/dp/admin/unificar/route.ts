// app/api/dp/admin/unificar/route.ts
// =============================================================================
// Unifica dois colaboradores duplicados em um só.
//
// Recebe:
//   { nomeManter: "ORINE DE LIMA GUEDES (NIL)", nomeRemover: "ORENI DE LIMA GUEDES (NIL)" }
//
// Faz atomicamente:
//   1. Em todos os fechamentos:
//      - Soma valorPorColaborador[nomeRemover] em valorPorColaborador[nomeManter]
//      - Remove a chave nomeRemover de valorPorColaborador
//   2. Apaga o colaborador nomeRemover do cadastro (se existir)
//
// Comparação de nomes é case-insensitive e trim'd.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'
import { Colaborador } from '@/lib/dp-types'

const KEY_COLABORADORES = 'dp:colaboradores'
const KEY_FECHAMENTOS   = 'dp:fechamentos'

interface Fechamento {
  id: string
  mesAno: string
  tipo: 'antecipacao' | 'folha'
  arquivo: string
  totalGeral: number
  totalPorCidade: Record<string, number>
  valorPorColaborador: Record<string, number>
  totalColaboradores: number
  dataImport: string
}

const norm = (s: string) => s.trim().toUpperCase()

export async function POST(req: NextRequest) {
  try {
    const { nomeManter, nomeRemover } = await req.json()

    if (!nomeManter || !nomeRemover) {
      return NextResponse.json({ erro: 'Faltam parâmetros nomeManter / nomeRemover' }, { status: 400 })
    }
    if (norm(nomeManter) === norm(nomeRemover)) {
      return NextResponse.json({ erro: 'Os nomes são idênticos — nada a unificar' }, { status: 400 })
    }

    const keyManter  = norm(nomeManter)
    const keyRemover = norm(nomeRemover)

    let pagamentosUnificados = 0
    let fechamentosAfetados = 0

    // ── 1. Atualiza fechamentos ───────────────────────────────────────────
    const fechs = await redis.get<Fechamento[]>(KEY_FECHAMENTOS) || []
    for (const f of fechs) {
      const vpc = { ...(f.valorPorColaborador || {}) }
      // Coleta todas as chaves do mapa que normalizam pra "remover"
      const chavesRemover = Object.keys(vpc).filter(k => norm(k) === keyRemover)
      if (chavesRemover.length === 0) continue

      // Soma os valores
      let valorRemovido = 0
      for (const k of chavesRemover) {
        valorRemovido += (vpc[k] || 0)
        delete vpc[k]
      }

      // Acha (ou cria) a chave do "manter" e soma
      const chaveManterExistente = Object.keys(vpc).find(k => norm(k) === keyManter)
      const chaveFinal = chaveManterExistente || nomeManter.trim().toUpperCase()
      vpc[chaveFinal] = (vpc[chaveFinal] || 0) + valorRemovido

      f.valorPorColaborador = vpc
      // totalColaboradores decrementa pelas chaves removidas (sem dupla contagem)
      f.totalColaboradores = Object.keys(vpc).length
      // totalGeral e totalPorCidade NÃO mudam — o dinheiro pago é o mesmo,
      // só foi reatribuído ao nome correto

      pagamentosUnificados++
      fechamentosAfetados++
    }
    if (fechamentosAfetados > 0) {
      await redis.set(KEY_FECHAMENTOS, fechs)
    }

    // ── 2. Apaga o colaborador "remover" do cadastro ──────────────────────
    const colabs = await redis.get<Colaborador[]>(KEY_COLABORADORES) || []
    const antes = colabs.length
    const filtrados = colabs.filter(c => norm(c.nome) !== keyRemover)
    const colabsRemovidos = antes - filtrados.length

    if (colabsRemovidos > 0) {
      await redis.set(KEY_COLABORADORES, filtrados)
    }

    return NextResponse.json({
      sucesso: true,
      fechamentosAfetados,
      pagamentosUnificados,
      colabsRemovidos,
      mensagem: `${pagamentosUnificados} pagamento(s) movido(s) de "${nomeRemover}" para "${nomeManter}". ${colabsRemovidos} cadastro(s) duplicado(s) removido(s).`,
    })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
