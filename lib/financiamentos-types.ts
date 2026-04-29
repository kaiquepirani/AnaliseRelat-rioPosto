// src/lib/financiamentos-types.ts

export type TipoBem =
  | 'Van'
  | 'Ônibus'
  | 'Micro-ônibus'
  | 'Carro Administrativo'
  | 'Veículo'
  | 'Compra de Veículos'
  | 'Equipamento Veicular'
  | 'Imóvel/Terreno'
  | 'Empréstimo'
  | 'Consignado Funcionário'
  | 'Outros'

export type PlanoOrigem = 'Financiamentos' | 'Veiculos'
export type Frequencia = 'mensal' | 'semanal' | 'unico'

export interface Financiamento {
  id: string
  descricao: string
  tipo: TipoBem
  planoOrigem: PlanoOrigem
  prefixo?: string
  fornecedor: string                  // banco / credor
  cc: string                          // centro de custo / filial
  parcelaAtual: number                // parcelas pagas no momento do cadastro
  totalParcelas: number
  valorParcela: number
  proximoVenc: string                 // YYYY-MM-DD da próxima parcela a vencer
  frequencia: Frequencia
  observacao?: string
  semInfo?: boolean                   // sem info clara de parcelamento
  reclassificado?: boolean            // foi reclassificado em auditoria
  temErro?: boolean                   // tem erro de cadastro detectado
  novoContrato?: boolean              // marcado como novo (visualmente destacado)
  createdAt: string
  updatedAt: string
}

export const TIPOS_BEM: TipoBem[] = [
  'Van', 'Ônibus', 'Micro-ônibus', 'Carro Administrativo', 'Veículo',
  'Compra de Veículos', 'Equipamento Veicular', 'Imóvel/Terreno',
  'Empréstimo', 'Consignado Funcionário', 'Outros',
]

export const PLANOS_ORIGEM: PlanoOrigem[] = ['Financiamentos', 'Veiculos']

export const CENTROS_CUSTO = [
  'GARAGEM AGUAS DE LINDOIA',
  'ESCOLAR ITAPIRA',
  'ITAPIRA',
  'AGUAI',
  'GARAGEM UBATUBA',
  'GARAGEM MOGI MIRIM',
  'MOCOCA',
  'RIO CLARO',
  'PORTO FERREIRA',
  'CASA BRANCA',
  'MORUNGABA',
  'ITATIBA',
  'GARAGEM E. S. PINHAL',
  'NÃO ALOCADO',
]

// ====================================================================
// Cálculos automáticos baseados em "hoje"
// Premissa: pagamentos sempre em dia
// ====================================================================

/**
 * Quantas parcelas JÁ deveriam ter sido pagas considerando data de hoje.
 * Cada vencimento que passou (incluindo hoje no dia exato) = +1 parcela paga.
 */
export const calcParcelasPagasAteHoje = (f: Financiamento, hoje?: Date): number => {
  if (!f.proximoVenc) return f.parcelaAtual || 0
  if (f.frequencia === 'unico') return f.parcelaAtual || 0

  const parts = f.proximoVenc.split('-')
  if (parts.length < 3) return f.parcelaAtual || 0

  const venY = parseInt(parts[0])
  const venM = parseInt(parts[1])
  const venD = parseInt(parts[2])

  const today = hoje || new Date()
  const ty = today.getFullYear()
  const tm = today.getMonth() + 1
  const td = today.getDate()

  const base = f.parcelaAtual || 0
  let extras = 0

  if (f.frequencia === 'mensal') {
    const monthsDiff = (ty - venY) * 12 + (tm - venM)
    if (monthsDiff > 0) {
      extras = monthsDiff
    } else if (monthsDiff === 0 && td >= venD) {
      extras = 1
    }
  } else if (f.frequencia === 'semanal') {
    const venDate = new Date(f.proximoVenc + 'T12:00:00')
    const daysDiff = Math.floor((today.getTime() - venDate.getTime()) / (1000 * 60 * 60 * 24))
    if (daysDiff >= 0) extras = Math.floor(daysDiff / 7) + 1
  }

  return Math.min(base + Math.max(extras, 0), f.totalParcelas || base)
}

/**
 * Próximo vencimento real considerando data de hoje.
 * Se a data armazenada já passou, avança o número correto de meses.
 */
export const calcProximoVencReal = (f: Financiamento, hoje?: Date): string | null => {
  if (!f.proximoVenc) return null
  if (f.frequencia !== 'mensal') return f.proximoVenc

  const pagasReal = calcParcelasPagasAteHoje(f, hoje)
  const base = f.parcelaAtual || 0
  const avanco = pagasReal - base
  if (avanco <= 0) return f.proximoVenc

  const parts = f.proximoVenc.split('-')
  const venY = parseInt(parts[0])
  const venM = parseInt(parts[1])
  const venD = parts[2]

  const totalMonths = (venM - 1) + avanco
  const newY = venY + Math.floor(totalMonths / 12)
  const newM = (totalMonths % 12) + 1

  return `${newY}-${String(newM).padStart(2, '0')}-${venD}`
}

export const calcRestantes = (f: Financiamento, hoje?: Date): number => {
  const pagas = calcParcelasPagasAteHoje(f, hoje)
  return Math.max((f.totalParcelas || 0) - pagas, 0)
}

export const calcSaldoDevedor = (f: Financiamento, hoje?: Date): number => {
  return calcRestantes(f, hoje) * (f.valorParcela || 0)
}

export const calcQuitacao = (f: Financiamento, hoje?: Date): string | null => {
  const restantes = calcRestantes(f, hoje)
  if (restantes === 0 || !f.proximoVenc) return null
  if (f.frequencia === 'unico') return f.proximoVenc.substring(0, 7)

  const proximo = calcProximoVencReal(f, hoje)
  if (!proximo) return null

  const parts = proximo.split('-')
  const sy = parseInt(parts[0])
  const sm = parseInt(parts[1])

  if (f.frequencia === 'semanal') {
    const dt = new Date(proximo + 'T12:00:00')
    dt.setDate(dt.getDate() + (7 * (restantes - 1)))
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
  } else {
    const tm = (sm - 1) + (restantes - 1)
    const y = sy + Math.floor(tm / 12)
    const m = (tm % 12) + 1
    return `${y}-${String(m).padStart(2, '0')}`
  }
}

export const calcProgressoPct = (f: Financiamento, hoje?: Date): number => {
  const total = f.totalParcelas || 1
  const pagas = calcParcelasPagasAteHoje(f, hoje)
  return total > 0 ? (pagas / total) * 100 : 0
}

// ====================================================================
// Cores e rótulos
// ====================================================================

export const CORES_TIPO: Record<TipoBem, string> = {
  'Ônibus': '#d4af37',
  'Micro-ônibus': '#fcd34d',
  'Van': '#a78bfa',
  'Veículo': '#14b8a6',
  'Imóvel/Terreno': '#f43f5e',
  'Carro Administrativo': '#60a5fa',
  'Empréstimo': '#fbbf24',
  'Consignado Funcionário': '#94a3b8',
  'Compra de Veículos': '#10b981',
  'Equipamento Veicular': '#22d3ee',
  'Outros': '#64748b',
}
