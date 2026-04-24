export type TipoServicoContrato = 'Transporte Escolar' | 'Transporte Saúde' | 'Fretamento' | 'Outro'
export type StatusContrato = 'vigente' | 'encerrado' | 'em_renovacao'

export interface Aditamento {
  id: string
  data: string                    // YYYY-MM-DD — data em que o aditamento foi assinado
  novaDataVencimento?: string     // YYYY-MM-DD
  novoValorMensal?: number
  novoValorTotal?: number
  observacoes?: string
  arquivoUrl: string
  arquivoNome: string
  arquivoSize: number
  createdAt: string
}

export interface Contrato {
  id: string
  numero: string
  cliente: string
  tipoServico: TipoServicoContrato
  cidade: string
  dataInicio: string
  dataVencimento: string
  valorMensal?: number
  valorTotal?: number
  objeto?: string
  observacoes?: string
  status: StatusContrato
  arquivoUrl?: string
  arquivoNome?: string
  arquivoSize?: number
  aditamentos?: Aditamento[]
  dataEncerramento?: string
  createdAt: string
  updatedAt: string
}

export interface ContratoComAlerta extends Contrato {
  diasRestantes: number
  situacao: 'vigente' | 'vencendo' | 'vencido' | 'encerrado' | 'em_renovacao'
}

export const TIPOS_SERVICO: TipoServicoContrato[] = [
  'Transporte Escolar',
  'Transporte Saúde',
  'Fretamento',
  'Outro',
]

export const DIAS_ALERTA_VENCIMENTO = 30

export const calcularSituacao = (contrato: Contrato): ContratoComAlerta => {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const venc = new Date(contrato.dataVencimento + 'T00:00:00')
  const diasRestantes = Math.floor((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))

  let situacao: ContratoComAlerta['situacao']
  if (contrato.status === 'encerrado') situacao = 'encerrado'
  else if (contrato.status === 'em_renovacao') situacao = 'em_renovacao'
  else if (diasRestantes < 0) situacao = 'vencido'
  else if (diasRestantes <= DIAS_ALERTA_VENCIMENTO) situacao = 'vencendo'
  else situacao = 'vigente'

  return { ...contrato, diasRestantes, situacao }
}
