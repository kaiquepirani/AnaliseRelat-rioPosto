export interface FaturamentoMensal {
  cidade: string                       // 'AGUAÍ ESCOLAR RURAL'
  ano: number                          // 2025
  meses: (number | null)[]             // 12 posições: jan a dez (null = sem dado)
  total: number                        // soma anual
}

export interface FaturamentoAno {
  ano: number
  totalAnual: number
  totalPorMes: number[]                // 12 posições, soma do mês de todas as cidades
  cidades: FaturamentoMensal[]
}

export interface FaturamentoCompleto {
  anos: number[]                       // [2022, 2023, 2024, 2025, 2026]
  porAno: Record<number, FaturamentoAno>
  totalGeral: number
  ultimaAtualizacao: string
}

export const NOMES_MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Normaliza nome de cidade para chave (sem acentos, espaços, etc)
export const normalizarCidade = (nome: string): string =>
  nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()

// Calcula crescimento entre dois valores (ex: ano anterior vs atual)
export const calcularCrescimento = (anterior: number, atual: number): number => {
  if (anterior === 0) return 0
  return ((atual - anterior) / anterior) * 100
}

// Soma total anual de uma cidade
export const totalCidadeAno = (fm: FaturamentoMensal): number => {
  let s = 0
  for (const v of fm.meses) if (typeof v === 'number') s += v
  return s
}
