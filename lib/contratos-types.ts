export type TipoServicoContrato = 'Transporte Escolar' | 'Transporte Saúde' | 'Fretamento' | 'Outro'
export type StatusContrato = 'vigente' | 'encerrado' | 'em_renovacao'
export type TipoAditamento = 'reajuste' | 'acrescimo' | 'supressao' | 'prorrogacao' | 'misto'

export interface ItemContrato {
  id: string
  descricao: string
  quantidade?: number
  unidade?: string
  valorUnitario?: number
  valorTotal?: number
}

export interface Aditamento {
  id: string
  numero?: number                 // 1, 2, 3... (ordem cronológica)
  data: string                    // YYYY-MM-DD
  tipo: TipoAditamento
  novaDataVencimento?: string
  novoValorMensal?: number
  novoValorTotal?: number
  percentualReajuste?: number
  indiceReajuste?: string
  observacoes?: string
  arquivoUrl?: string
  arquivoNome?: string
  arquivoSize?: number
  createdAt: string
  itensResultantes?: ItemContrato[]  // estado dos itens APÓS este aditamento
  itensAnteriores?: ItemContrato[]   // estado dos itens ANTES deste aditamento
}

export interface Contrato {
  id: string
  numero: string
  cliente: string
  contratante?: string
  cnpjContratante?: string
  processoAdministrativo?: string  // ex: "152/2023"
  modalidadeLicitacao?: string     // ex: "Pregão Eletrônico nº 043/2023"
  tipoServico: TipoServicoContrato
  cidade: string
  dataInicio: string
  dataVencimento: string
  valorMensal?: number
  valorTotal?: number
  valorTotalOriginal?: number
  objeto?: string
  observacoes?: string
  itens?: ItemContrato[]            // itens ORIGINAIS (contrato nativo)
  clausulaReajuste?: string
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
  situacao: 'vigente' | 'vencendo' | 'vencendo_60' | 'vencido' | 'encerrado' | 'em_renovacao'
}

export const TIPOS_SERVICO: TipoServicoContrato[] = [
  'Transporte Escolar',
  'Transporte Saúde',
  'Fretamento',
  'Outro',
]

export const DIAS_ALERTA_VENCIMENTO = 30
export const DIAS_ALERTA_VENCIMENTO_60 = 60

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
  else if (diasRestantes <= DIAS_ALERTA_VENCIMENTO_60) situacao = 'vencendo_60'
  else situacao = 'vigente'

  return { ...contrato, diasRestantes, situacao }
}

export const rotuloAditamentoAtual = (contrato: Contrato): string => {
  const ads = contrato.aditamentos
  if (!ads || ads.length === 0) return 'Contrato original'
  const n = ads.length
  return `${n}º Termo Aditivo (${n === 1 ? '1 aditamento' : `${n} aditamentos`})`
}

// Retorna os ITENS ATUALMENTE VIGENTES do contrato (última versão após todos aditamentos)
export const itensVigentes = (contrato: Contrato): ItemContrato[] => {
  const ads = contrato.aditamentos
  if (ads && ads.length > 0) {
    // percorre aditamentos do mais recente pro mais antigo, achando o primeiro com itensResultantes
    for (let i = ads.length - 1; i >= 0; i--) {
      const ad = ads[i]
      if (ad.itensResultantes && ad.itensResultantes.length > 0) {
        return ad.itensResultantes
      }
    }
  }
  return contrato.itens || []
}

// Retorna o VALOR TOTAL ATUAL do contrato (considerando último aditamento)
export const valorTotalAtual = (contrato: Contrato): number => {
  const ads = contrato.aditamentos
  if (ads && ads.length > 0) {
    for (let i = ads.length - 1; i >= 0; i--) {
      const ad = ads[i]
      if (ad.novoValorTotal != null) return ad.novoValorTotal
    }
  }
  if (contrato.valorTotal != null) return contrato.valorTotal
  return somarValoresItens(itensVigentes(contrato))
}

// Retorna o VALOR MENSAL ATUAL (valor total dividido por 12 se não explícito)
export const valorMensalAtual = (contrato: Contrato): number => {
  const ads = contrato.aditamentos
  if (ads && ads.length > 0) {
    for (let i = ads.length - 1; i >= 0; i--) {
      const ad = ads[i]
      if (ad.novoValorMensal != null) return ad.novoValorMensal
    }
  }
  if (contrato.valorMensal != null) return contrato.valorMensal
  return valorTotalAtual(contrato) / 12
}

export const aplicarReajustePercentual = (itens: ItemContrato[] | undefined, percentual: number): ItemContrato[] => {
  if (!itens || itens.length === 0) return []
  const fator = 1 + (percentual / 100)
  return itens.map(it => {
    const novoUnit = it.valorUnitario != null ? Number((it.valorUnitario * fator).toFixed(4)) : undefined
    const novoTotal = novoUnit != null && it.quantidade != null
      ? Number((novoUnit * it.quantidade).toFixed(2))
      : (it.valorTotal != null ? Number((it.valorTotal * fator).toFixed(2)) : undefined)
    return { ...it, valorUnitario: novoUnit, valorTotal: novoTotal }
  })
}

export const somarValoresItens = (itens: ItemContrato[] | undefined): number => {
  if (!itens || itens.length === 0) return 0
  return itens.reduce((acc, it) => acc + (it.valorTotal || 0), 0)
}

export const rotuloTipoAditamento = (tipo: TipoAditamento): string => {
  if (tipo === 'reajuste')     return 'Reajuste'
  if (tipo === 'acrescimo')    return 'Acréscimo'
  if (tipo === 'supressao')    return 'Supressão'
  if (tipo === 'prorrogacao')  return 'Prorrogação'
  return 'Misto'
}

export const corTipoAditamento = (tipo: TipoAditamento): string => {
  if (tipo === 'reajuste')     return '#0369a1'
  if (tipo === 'acrescimo')    return '#047857'
  if (tipo === 'supressao')    return '#b45309'
  if (tipo === 'prorrogacao')  return '#6d28d9'
  return '#475569'
}
