export interface Lancamento {
  documento: string
  emissao: string
  vencimento: string
  placaLida: string
  placaCorrigida?: string
  km?: number
  combustivel: string
  combustivelNome: string
  litros: number
  vlrUnitario: number
  valor: number
  status: 'confirmada' | 'provavel' | 'nao_identificada'
  nFrota?: string
  grupo?: string
  marca?: string
  modelo?: string
  motorista?: string
}

export interface ResumoPosto {
  nome: string
  cnpj: string
  cidade?: string
  totalValor: number
  totalLitros: number
  totalVeiculos: number
  porCombustivel: Record<string, { valor: number; litros: number }>
  lancamentos: Lancamento[]
}

export interface Extrato {
  id: string
  arquivo: string
  dataUpload: string
  periodo: string
  postos: ResumoPosto[]
  totalValor: number
  totalLitros: number
  totalVeiculos: number
  alertas: {
    confirmada: number
    confirmadaValor: number
    provavel: number
    provalValor: number
    naoIdentificada: number
    naoIdentificadaValor: number
  }
  kmVeiculos: Record<string, { kmAtual: number; mediaPeriodo?: number }>
}
