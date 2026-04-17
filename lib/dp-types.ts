// ── Departamento Pessoal — Types ──────────────────────────────────────────

export type Cidade =
  | 'Águas de Lindóia (Folha)'
  | 'Águas de Lindóia (Diárias)'
  | 'Morungaba'
  | 'Mogi Mirim'
  | 'Itapira (Escolar)'
  | 'Itapira (Saúde)'
  | 'Aguaí'
  | 'Casa Branca'
  | 'Pinhal'
  | 'Ubatuba'
  | 'Porto Ferreira'
  | 'Lindóia'
  | 'Mococa'
  | 'Rio Claro'

export type Funcao =
  | 'Motorista'
  | 'Monitor(a)'
  | 'Mecânico'
  | 'Administrativo'
  | 'Contador'
  | 'Outro'

export type StatusColaborador = 'ativo' | 'inativo' | 'afastado'

export interface DadosBancarios {
  banco: string
  agencia?: string
  conta?: string
  pix?: string
  tipoConta?: 'corrente' | 'poupança' | 'salário'
}

export interface Colaborador {
  id: string
  nome: string
  cpf?: string
  cidade: Cidade
  funcao: Funcao
  salarioBase: number
  dataInicio: string          // dd/mm/aaaa
  dataDesligamento?: string   // dd/mm/aaaa
  status: StatusColaborador
  dadosBancarios: DadosBancarios
  observacoes?: string        // grávida, aposentado, cargo confiança etc.
  createdAt: string
  updatedAt: string
}

// ── Lançamento mensal de um colaborador ──────────────────────────────────

export type TipoLancamento =
  | 'antecipacao'       // 40% pago dia 20
  | 'salario'           // 60% pago dia 10 do mês seguinte
  | 'diaria'
  | 'salario_familia'
  | 'desconto_falta'
  | 'desconto_vale'
  | 'desconto_consignado'
  | 'desconto_multa'
  | 'reembolso'
  | 'bonus'
  | 'outro_credito'
  | 'outro_desconto'

export interface Lancamento {
  id: string
  colaboradorId: string
  mesAno: string              // "2026-03"
  tipo: TipoLancamento
  descricao: string
  valor: number               // positivo = crédito, negativo = desconto
  parcela?: string            // "02 de 03"
  createdAt: string
}

// ── Folha mensal por cidade ───────────────────────────────────────────────

export interface FolhaCidade {
  cidade: Cidade
  mesAno: string              // "2026-03"
  colaboradores: ColaboradorFolha[]
  totalAntecipacao: number    // pago dia 20
  totalFolha: number          // pago dia 10
  statusAntecipacao: 'pendente' | 'pago' | 'parcial'
  statusFolha: 'pendente' | 'pago' | 'parcial'
  dataPagamentoAntecipacao?: string
  dataPagamentoFolha?: string
}

export interface ColaboradorFolha {
  colaboradorId: string
  nome: string
  salarioBase: number
  lancamentos: Lancamento[]
  totalBruto: number
  totalDescontos: number
  totalAntecipacao: number    // 40% pago dia 20
  totalReceber: number        // líquido pago dia 10
}

// ── Resumo mensal geral ───────────────────────────────────────────────────

export interface ResumoMensal {
  mesAno: string
  cidades: {
    cidade: Cidade
    totalAntecipacao: number
    totalFolha: number
    totalColaboradores: number
  }[]
  totalGeralAntecipacao: number
  totalGeralFolha: number
  totalGeralColaboradores: number
}

// ── Pagamento registrado ──────────────────────────────────────────────────

export type TipoPagamento = 'antecipacao' | 'folha'

export interface Pagamento {
  id: string
  mesAno: string
  cidade: Cidade
  tipo: TipoPagamento
  valor: number
  dataPagamento: string       // dd/mm/aaaa
  observacoes?: string
  createdAt: string
}
