// ──────────────────────────────────────────────────────────────────────
// Gestão Operacional — Tipos, mapeamento de bases e consolidador
// ──────────────────────────────────────────────────────────────────────

export const ANO_GESTAO = 2026

// Multiplicador de encargos sociais sobre a folha líquida.
// Simula INSS, FGTS, férias e 13º — aproximação do custo real de pessoal.
export const MULTIPLICADOR_ENCARGOS = 1.7

// Alíquota agregada de impostos sobre receita.
// Aproximação que cobre PIS/COFINS, ISS, IRPJ/CSLL no regime aplicável.
// Aplicada uniformemente a todas as bases (decisão gerencial — abr/2026).
export const ALIQUOTA_IMPOSTOS = 0.13                       // 13%
export const FATOR_RECEITA_LIQUIDA = 1 - ALIQUOTA_IMPOSTOS  // 0.87

export interface BaseOperacional {
  id: string
  nome: string
  folhaCidades: string[]
  postos: string[]
  faturamentoLinhas: string[]
  observacao?: string
}

// Mapeamento pré-populado (abr/2026)
export const BASES_PADRAO: BaseOperacional[] = [
  {
    id: 'aguas-lindoia',
    nome: 'Águas de Lindóia',
    folhaCidades: ['Águas de Lindóia (Folha)', 'Águas de Lindóia (Diárias)'],
    postos: ['Tanque Águas', 'Posto Portal', 'Posto Shell Queijo Bom'],
    faturamentoLinhas: [
      'Águas Saúde',
      'Águas Educação',
      'Monte Sião Saúde',
      'Lindóia Saúde',
      'Orbis Renováveis',
    ],
  },
  {
    id: 'lindoia',
    nome: 'Lindóia',
    folhaCidades: ['Lindóia'],
    postos: ['São Benedito'],
    faturamentoLinhas: ['Lindóia Escolar'],
  },
  {
    id: 'itapira-saude',
    nome: 'Itapira Saúde',
    folhaCidades: ['Itapira (Saúde)'],
    postos: ['Skina dos Italianos'],
    faturamentoLinhas: ['Itapira Saúde', 'Itapira Promoção', 'Itapira Esporte'],
  },
  {
    id: 'itapira-educacao',
    nome: 'Itapira Educação',
    folhaCidades: ['Itapira (Escolar)'],
    postos: ['Itapirense'],
    faturamentoLinhas: ['Itapira Educação'],
  },
  {
    id: 'mogi-mirim',
    nome: 'Mogi Mirim',
    folhaCidades: ['Mogi Mirim'],
    postos: ['RVM Max', 'Posto Vitoria'],
    faturamentoLinhas: ['Mogi Saúde', 'DSR S.J.B.V.'],
  },
  {
    id: 'pinhal',
    nome: 'Pinhal',
    folhaCidades: ['Pinhal'],
    postos: ['Cooperativa dos Cafeicultores', 'Posto São Cristovão'],
    faturamentoLinhas: ['Pinhal Educação', 'Pinhal Saúde', 'S.A. Jardim'],
  },
  {
    id: 'aguai',
    nome: 'Aguaí',
    folhaCidades: ['Aguaí'],
    postos: ['Posto JL'],
    faturamentoLinhas: ['Aguaí Faculdade', 'Aguaí Escolar Urbano', 'Aguaí Escolar Rural'],
  },
  {
    id: 'mococa',
    nome: 'Mococa',
    folhaCidades: ['Mococa'],
    postos: ['Mocafor'],
    faturamentoLinhas: ['Mococa Saúde', 'Mococa Educação'],
  },
  {
    id: 'porto-ferreira',
    nome: 'Porto Ferreira',
    folhaCidades: ['Porto Ferreira'],
    postos: [],
    faturamentoLinhas: [
      'Porto Ferreira (Monitoras)',
      'Porto Ferreira (Van)',
      'Porto Ferreira (Onibus)',
    ],
    observacao: 'Posto a confirmar e cadastrar',
  },
  {
    id: 'casa-branca',
    nome: 'Casa Branca',
    folhaCidades: ['Casa Branca'],
    postos: ['Jose Militão de Melo Filho'],
    faturamentoLinhas: ['Casa Branca', 'CASA BRANCA'],
    observacao: 'Faturamento recebido em outra conta — margem não reflete realidade',
  },
  {
    id: 'morungaba',
    nome: 'Morungaba',
    folhaCidades: ['Morungaba'],
    postos: ['Irmaos Miguel'],
    faturamentoLinhas: ['Morungaba'],
  },
  {
    id: 'rio-claro',
    nome: 'Rio Claro',
    folhaCidades: ['Rio Claro'],
    postos: ['Cobrão', 'Abastece Rio Claro'],
    faturamentoLinhas: ['Rio Claro'],
    observacao: 'Posto Abastece Rio Claro ainda não lançado',
  },
  {
    id: 'ubatuba',
    nome: 'Ubatuba',
    folhaCidades: ['Ubatuba'],
    postos: ['Praia de São Francisco'],
    faturamentoLinhas: ['Ubatuba Saúde', 'Ubatuba Educação', 'Ubatuba Faculdade', 'Ubatuba Esporte'],
  },
]

// Itens que devem ser ignorados (não somados em nenhuma base E não aparecem no banner de órfãos)
export const IGNORAR = {
  postos: [] as string[],
  folhaCidades: [] as string[],
  faturamentoLinhas: [] as string[],
}

// ──────────────────────────────────────────────────────────────────────
// Vínculos manuais de postos a bases
// ──────────────────────────────────────────────────────────────────────

export type VinculosPostos = { [nomeNormalizado: string]: string }

/** Normaliza nome de posto pra chave de vínculo (case + acento agnóstico) */
export const chaveVinculoPosto = (nome: string): string => {
  if (!nome) return ''
  return nome
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Encontra a base operacional de um posto.
 * Prioridade: vínculo manual > matching tolerante com BASES_PADRAO[].postos.
 */
export const encontrarBaseDoPosto = (
  nomePosto: string,
  bases: BaseOperacional[],
  vinculos?: VinculosPostos,
): BaseOperacional | null => {
  if (!nomePosto) return null
  if (vinculos) {
    const chave = chaveVinculoPosto(nomePosto)
    const baseId = vinculos[chave]
    if (baseId) {
      for (let i = 0; i < bases.length; i++) {
        if (bases[i].id === baseId) return bases[i]
      }
    }
  }
  for (let i = 0; i < bases.length; i++) {
    if (matchTolerante(nomePosto, bases[i].postos)) return bases[i]
  }
  return null
}

// ──────────────────────────────────────────────────────────────────────
// Helpers de matching
// ──────────────────────────────────────────────────────────────────────

const STOPWORDS: { [w: string]: true } = (() => {
  const arr = [
    'a', 'o', 'as', 'os', 'da', 'de', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos',
    'e', 'ou', 'com', 'sem', 'para', 'por', 'sob', 'um', 'uma',
    'auto', 'posto', 'ltda', 'epp', 'me', 'sa', 'cia', 'co', 'eireli', 'eire',
    'comercio', 'comercial', 'industria', 'industrial',
    'distribuidora', 'distribuidor', 'distribuicao',
    'combustivel', 'combustiveis', 'derivados', 'petroleo', 'gas',
  ]
  const m: { [w: string]: true } = {}
  for (let i = 0; i < arr.length; i++) m[arr[i]] = true
  return m
})()

export const normalizar = (s: string): string => {
  if (!s) return ''
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,()[\]{}\/\\\-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const semEspacos = (s: string): string => s.replace(/\s+/g, '')

const tokensSig = (s: string): string[] => {
  const norm = normalizar(s)
  if (!norm) return []
  const partes = norm.split(' ')
  const out: string[] = []
  for (let i = 0; i < partes.length; i++) {
    const t = partes[i]
    if (t.length < 2) continue
    if (STOPWORDS[t]) continue
    out.push(t)
  }
  return out
}

const matchPorTokens = (mapeamento: string, candidato: string): boolean => {
  const tokensMap = tokensSig(mapeamento)
  if (tokensMap.length === 0) return false
  const tokensCand = tokensSig(candidato)
  if (tokensCand.length === 0) return false
  const setCand: { [t: string]: true } = {}
  for (let i = 0; i < tokensCand.length; i++) setCand[tokensCand[i]] = true
  for (let i = 0; i < tokensMap.length; i++) {
    if (!setCand[tokensMap[i]]) return false
  }
  return true
}

export const matchTolerante = (alvo: string, lista: string[]): boolean => {
  if (!alvo || !lista || lista.length === 0) return false
  const alvoN = normalizar(alvo)
  if (!alvoN) return false
  const alvoNS = semEspacos(alvoN)

  for (let i = 0; i < lista.length; i++) {
    const item = lista[i]
    const itemN = normalizar(item)
    if (!itemN) continue

    if (alvoN === itemN || alvoN.indexOf(itemN) >= 0 || itemN.indexOf(alvoN) >= 0) {
      return true
    }

    const itemNS = semEspacos(itemN)
    if (alvoNS && itemNS && (alvoNS === itemNS || alvoNS.indexOf(itemNS) >= 0 || itemNS.indexOf(alvoNS) >= 0)) {
      return true
    }

    if (matchPorTokens(item, alvo)) return true
  }
  return false
}

// ──────────────────────────────────────────────────────────────────────
// Tipos de saída
// ──────────────────────────────────────────────────────────────────────

export interface ValorMensal {
  receita: number
  combustivel: number
  folhaLiquida: number
}

export interface ConsolidadoBase {
  baseId: string
  baseNome: string
  observacao?: string
  meses: ValorMensal[]
  totalReceita: number
  totalCombustivel: number
  totalFolhaLiquida: number
  temFolhaMapeada: boolean
  temPostoMapeado: boolean
  temFaturamentoMapeado: boolean
  postosMapeadosNaoEncontrados: string[]
  folhaCidadesMapeadasNaoEncontradas: string[]
  faturamentoLinhasMapeadasNaoEncontradas: string[]
}

export interface ConsolidadoCompleto {
  ano: number
  bases: ConsolidadoBase[]
  totaisGerais: {
    totalReceita: number
    totalCombustivel: number
    totalFolhaLiquida: number
  }
  totaisPorMes: ValorMensal[]
  postosOrfaos: string[]
  folhaCidadesOrfas: string[]
  faturamentoLinhasOrfas: string[]
  ultimaAtualizacao: string
  fontes: {
    qtdExtratos: number
    qtdPagamentos: number
    qtdLinhasFaturamento: number
  }
}

// ──────────────────────────────────────────────────────────────────────
// Consolidador
// ──────────────────────────────────────────────────────────────────────

interface InputConsolidacao {
  ano: number
  faturamento: any
  extratos: any[]
  pagamentos: any[]
  bases: BaseOperacional[]
  vinculosPostos?: VinculosPostos
}

const parseAnoMes = (data: string): { ano: number | null; mes: number | null } => {
  if (!data || typeof data !== 'string') return { ano: null, mes: null }

  let m = data.match(/^(\d{4})-(\d{1,2})/)
  if (m) return { ano: parseInt(m[1], 10), mes: parseInt(m[2], 10) - 1 }

  m = data.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m) {
    let ano = parseInt(m[3], 10)
    if (ano < 100) ano += ano < 50 ? 2000 : 1900
    return { ano, mes: parseInt(m[2], 10) - 1 }
  }

  m = data.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/)
  if (m) {
    let ano = parseInt(m[3], 10)
    if (ano < 100) ano += ano < 50 ? 2000 : 1900
    return { ano, mes: parseInt(m[2], 10) - 1 }
  }

  return { ano: null, mes: null }
}

const arrZeros = (): ValorMensal[] => {
  const out: ValorMensal[] = []
  for (let i = 0; i < 12; i++) out.push({ receita: 0, combustivel: 0, folhaLiquida: 0 })
  return out
}

const extrairPostos = (ext: any): any[] => {
  if (!ext) return []
  if (Array.isArray(ext.postos)) return ext.postos
  if (ext.posto) return [ext.posto]
  return []
}

const extrairDataLanc = (lanc: any): string => {
  if (!lanc) return ''
  return String(lanc.emissao || lanc.data || lanc.dataEmissao || lanc.dataAbastecimento || '')
}

const ehIgnorado = (nome: string, listaIgnorar: string[]): boolean => {
  if (!nome || !listaIgnorar || listaIgnorar.length === 0) return false
  return matchTolerante(nome, listaIgnorar)
}

export const consolidar = (input: InputConsolidacao): ConsolidadoCompleto => {
  const { ano, faturamento, extratos, pagamentos, bases, vinculosPostos } = input

  const porBase: { [id: string]: ConsolidadoBase } = {}
  bases.forEach(b => {
    porBase[b.id] = {
      baseId: b.id,
      baseNome: b.nome,
      observacao: b.observacao,
      meses: arrZeros(),
      totalReceita: 0,
      totalCombustivel: 0,
      totalFolhaLiquida: 0,
      temFolhaMapeada: b.folhaCidades.length > 0,
      temPostoMapeado: b.postos.length > 0,
      temFaturamentoMapeado: b.faturamentoLinhas.length > 0,
      postosMapeadosNaoEncontrados: b.postos.slice(),
      folhaCidadesMapeadasNaoEncontradas: b.folhaCidades.slice(),
      faturamentoLinhasMapeadasNaoEncontradas: b.faturamentoLinhas.slice(),
    }
  })

  const postosUsados: { [nome: string]: true } = {}
  const cidadesFolhaUsadas: { [cidade: string]: true } = {}
  const linhasFatUsadas: { [linha: string]: true } = {}

  const marcarEncontrado = (lista: string[], alvo: string) => {
    for (let i = lista.length - 1; i >= 0; i--) {
      if (matchTolerante(alvo, [lista[i]])) {
        lista.splice(i, 1)
      }
    }
  }

  let qtdLinhasFat = 0
  if (faturamento && faturamento.porAno && faturamento.porAno[ano]) {
    const dadosAno = faturamento.porAno[ano]
    const linhas = Array.isArray(dadosAno.cidades) ? dadosAno.cidades : []
    qtdLinhasFat = linhas.length
    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i]
      const nomeLinha = linha.cidade
      if (!nomeLinha) continue

      let baseEncontrada: BaseOperacional | null = null
      for (let j = 0; j < bases.length; j++) {
        if (matchTolerante(nomeLinha, bases[j].faturamentoLinhas)) {
          baseEncontrada = bases[j]
          break
        }
      }
      if (!baseEncontrada) continue

      linhasFatUsadas[nomeLinha] = true
      marcarEncontrado(porBase[baseEncontrada.id].faturamentoLinhasMapeadasNaoEncontradas, nomeLinha)

      const meses = Array.isArray(linha.meses) ? linha.meses : []
      for (let m = 0; m < 12; m++) {
        const v = Number(meses[m]) || 0
        porBase[baseEncontrada.id].meses[m].receita += v
        porBase[baseEncontrada.id].totalReceita += v
      }
    }
  }

  for (let i = 0; i < extratos.length; i++) {
    const ext = extratos[i]
    if (!ext) continue
    const postosArr = extrairPostos(ext)

    for (let j = 0; j < postosArr.length; j++) {
      const posto = postosArr[j]
      if (!posto) continue
      const nomePosto = posto.nome ? String(posto.nome) : ''
      if (!nomePosto) continue

      const baseEncontrada = encontrarBaseDoPosto(nomePosto, bases, vinculosPostos)
      if (!baseEncontrada) continue

      postosUsados[nomePosto] = true
      marcarEncontrado(porBase[baseEncontrada.id].postosMapeadosNaoEncontrados, nomePosto)

      const lancs = Array.isArray(posto.lancamentos) ? posto.lancamentos : []
      for (let l = 0; l < lancs.length; l++) {
        const lanc = lancs[l]
        const data = extrairDataLanc(lanc)
        if (!data) continue
        const parsed = parseAnoMes(data)
        if (parsed.ano !== ano) continue
        if (parsed.mes == null) continue
        const v = Number(lanc.valor) || 0
        porBase[baseEncontrada.id].meses[parsed.mes].combustivel += v
        porBase[baseEncontrada.id].totalCombustivel += v
      }
    }
  }

  let qtdPagAno = 0
  for (let i = 0; i < pagamentos.length; i++) {
    const p = pagamentos[i]
    if (!p || !p.mesAno) continue
    if (String(p.mesAno).indexOf(String(ano)) !== 0) continue
    qtdPagAno++

    const cidade = p.cidade || ''
    if (!cidade) continue

    let baseEncontrada: BaseOperacional | null = null
    for (let j = 0; j < bases.length; j++) {
      if (matchTolerante(cidade, bases[j].folhaCidades)) {
        baseEncontrada = bases[j]
        break
      }
    }
    if (!baseEncontrada) continue

    cidadesFolhaUsadas[cidade] = true
    marcarEncontrado(porBase[baseEncontrada.id].folhaCidadesMapeadasNaoEncontradas, cidade)

    const partes = String(p.mesAno).split('-')
    const mesIdx = partes.length >= 2 ? parseInt(partes[1], 10) - 1 : -1
    if (mesIdx < 0 || mesIdx > 11) continue

    const v = Number(p.valor) || 0
    porBase[baseEncontrada.id].meses[mesIdx].folhaLiquida += v
    porBase[baseEncontrada.id].totalFolhaLiquida += v
  }

  const todosPostosNaFonte: { [n: string]: true } = {}
  for (let i = 0; i < extratos.length; i++) {
    const postosArr = extrairPostos(extratos[i])
    for (let j = 0; j < postosArr.length; j++) {
      if (postosArr[j] && postosArr[j].nome) todosPostosNaFonte[postosArr[j].nome] = true
    }
  }
  const postosOrfaos: string[] = []
  Object.keys(todosPostosNaFonte).forEach(p => {
    if (!postosUsados[p] && !ehIgnorado(p, IGNORAR.postos)) postosOrfaos.push(p)
  })

  const linhasFatTodas: { [l: string]: true } = {}
  if (faturamento && faturamento.porAno && faturamento.porAno[ano]) {
    const linhas = Array.isArray(faturamento.porAno[ano].cidades) ? faturamento.porAno[ano].cidades : []
    for (let i = 0; i < linhas.length; i++) {
      if (linhas[i].cidade) linhasFatTodas[linhas[i].cidade] = true
    }
  }
  const faturamentoLinhasOrfas: string[] = []
  Object.keys(linhasFatTodas).forEach(l => {
    if (!linhasFatUsadas[l] && !ehIgnorado(l, IGNORAR.faturamentoLinhas)) faturamentoLinhasOrfas.push(l)
  })

  const cidadesFolhaTodas: { [c: string]: true } = {}
  for (let i = 0; i < pagamentos.length; i++) {
    const p = pagamentos[i]
    if (p && p.cidade && p.mesAno && String(p.mesAno).indexOf(String(ano)) === 0) {
      cidadesFolhaTodas[p.cidade] = true
    }
  }
  const folhaCidadesOrfas: string[] = []
  Object.keys(cidadesFolhaTodas).forEach(c => {
    if (!cidadesFolhaUsadas[c] && !ehIgnorado(c, IGNORAR.folhaCidades)) folhaCidadesOrfas.push(c)
  })

  const totaisPorMes = arrZeros()
  let totalReceita = 0, totalCombustivel = 0, totalFolhaLiquida = 0
  bases.forEach(b => {
    const cons = porBase[b.id]
    for (let m = 0; m < 12; m++) {
      totaisPorMes[m].receita += cons.meses[m].receita
      totaisPorMes[m].combustivel += cons.meses[m].combustivel
      totaisPorMes[m].folhaLiquida += cons.meses[m].folhaLiquida
    }
    totalReceita += cons.totalReceita
    totalCombustivel += cons.totalCombustivel
    totalFolhaLiquida += cons.totalFolhaLiquida
  })

  const basesArr = bases.map(b => porBase[b.id])

  return {
    ano,
    bases: basesArr,
    totaisGerais: { totalReceita, totalCombustivel, totalFolhaLiquida },
    totaisPorMes,
    postosOrfaos,
    folhaCidadesOrfas,
    faturamentoLinhasOrfas,
    ultimaAtualizacao: new Date().toISOString(),
    fontes: {
      qtdExtratos: extratos.length,
      qtdPagamentos: qtdPagAno,
      qtdLinhasFaturamento: qtdLinhasFat,
    },
  }
}
