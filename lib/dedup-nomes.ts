// lib/dedup-nomes.ts
// =============================================================================
// Algoritmo de detecção de nomes duplicados/similares
// =============================================================================
//
// Calcula similaridade entre dois nomes considerando:
//   1. Distância de Levenshtein (edits de caractere)
//   2. Bônus por mesma cidade (+5%)
//   3. Bônus por apelido idêntico entre parênteses ex: "(NIL)" (+15%)
//   4. Bônus por iniciais idênticas (+5%)
//   5. Bônus por mesmo número de palavras (+3%)
//
// Saída: score de 0 a 1, onde 1 = idêntico
//
// Limites recomendados:
//   - >= 0.90: tratar como duplicata (auto-merge na importação)
//   - 0.75 a 0.89: revisão manual (tela "detective")
//   - <  0.75: pessoas diferentes
// =============================================================================

/** Normaliza um nome para comparação: sem acento, uppercase, sem espaços extras */
export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // remove acentos
    .replace(/[^A-Za-z0-9 ()]/g, ' ')                   // mantém só letras, dígitos, espaços e parênteses
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

/** Extrai apelido entre parênteses, ex: "JOÃO (NIL)" → "NIL" */
export function extrairApelido(nome: string): string | null {
  const m = nome.match(/\(([^)]+)\)/)
  return m ? normalizarNome(m[1]) : null
}

/** Remove o apelido do nome para comparar só a parte principal */
export function nomeBase(nome: string): string {
  return normalizarNome(nome.replace(/\([^)]+\)/g, ''))
}

/** Distância de Levenshtein (clássico) */
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        )
      }
    }
  }
  return matrix[b.length][a.length]
}

/** Iniciais de um nome: "MARCO ANTONIO MENDES DE GODOI" → "MAMG" (ignora "DE/DA/DO") */
function iniciais(nome: string): string {
  const stop = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E'])
  return nomeBase(nome)
    .split(/\s+/)
    .filter(p => p && !stop.has(p))
    .map(p => p.charAt(0))
    .join('')
}

export interface SimilaridadeDetalhe {
  score: number             // 0 a 1
  baseLevenshtein: number   // similaridade só do Levenshtein
  bonusCidade: number
  bonusApelido: number
  bonusIniciais: number
  bonusPalavras: number
}

/**
 * Calcula similaridade entre dois nomes, com bônus contextuais.
 * Cidade é opcional — se não passada, ignora o bônus de cidade.
 */
export function calcularSimilaridade(
  nomeA: string,
  nomeB: string,
  cidadeA?: string,
  cidadeB?: string,
): SimilaridadeDetalhe {
  const baseA = nomeBase(nomeA)
  const baseB = nomeBase(nomeB)

  if (baseA === baseB && (extrairApelido(nomeA) === extrairApelido(nomeB))) {
    return {
      score: 1,
      baseLevenshtein: 1,
      bonusCidade: 0,
      bonusApelido: 0,
      bonusIniciais: 0,
      bonusPalavras: 0,
    }
  }

  // Levenshtein normalizado pelo tamanho do maior
  const dist = levenshtein(baseA, baseB)
  const maxLen = Math.max(baseA.length, baseB.length)
  const baseSim = maxLen === 0 ? 0 : 1 - dist / maxLen

  // ─── Bônus ──────────────────────────────────────────────────────
  let bonusCidade = 0
  let bonusApelido = 0
  let bonusIniciais = 0
  let bonusPalavras = 0

  if (cidadeA && cidadeB && cidadeA === cidadeB) bonusCidade = 0.05

  const apA = extrairApelido(nomeA)
  const apB = extrairApelido(nomeB)
  if (apA && apB && apA === apB) bonusApelido = 0.15
  // Se um tem apelido e o outro não tem, neutro (não pune)
  // Se ambos têm apelidos diferentes, penaliza
  if (apA && apB && apA !== apB) bonusApelido = -0.10

  if (iniciais(nomeA) === iniciais(nomeB)) bonusIniciais = 0.05

  const palavrasA = baseA.split(/\s+/).filter(Boolean).length
  const palavrasB = baseB.split(/\s+/).filter(Boolean).length
  if (palavrasA === palavrasB && palavrasA > 1) bonusPalavras = 0.03

  const score = Math.max(0, Math.min(1, baseSim + bonusCidade + bonusApelido + bonusIniciais + bonusPalavras))

  return {
    score,
    baseLevenshtein: baseSim,
    bonusCidade,
    bonusApelido,
    bonusIniciais,
    bonusPalavras,
  }
}

// ─────────────────────────────────────────────────────────────────────
// Limites de decisão
// ─────────────────────────────────────────────────────────────────────
export const LIMITE_AUTO_MERGE = 0.90   // >= 90%: unifica automaticamente
export const LIMITE_REVISAO    = 0.75   // 75-89%: aparece na revisão manual

export type ResultadoMatch =
  | { tipo: 'identico'; alvo: string; score: 1 }
  | { tipo: 'auto_merge'; alvo: string; score: number; detalhe: SimilaridadeDetalhe }
  | { tipo: 'revisar';    alvo: string; score: number; detalhe: SimilaridadeDetalhe }
  | { tipo: 'novo' }

/**
 * Procura o melhor match para `nomeNovo` em uma lista existente.
 *
 * @param nomeNovo Nome que está chegando (ex: na importação)
 * @param cidadeNovo Cidade do nome novo
 * @param existentes Lista de nomes já cadastrados, com cidade opcional
 * @returns Decisão: idêntico, auto-merge, revisar ou novo
 */
export function buscarMatch(
  nomeNovo: string,
  cidadeNovo: string | undefined,
  existentes: Array<{ nome: string; cidade?: string }>,
): ResultadoMatch {
  let melhor: { alvo: string; detalhe: SimilaridadeDetalhe } | null = null

  for (const ex of existentes) {
    const det = calcularSimilaridade(nomeNovo, ex.nome, cidadeNovo, ex.cidade)
    if (det.score === 1) {
      return { tipo: 'identico', alvo: ex.nome, score: 1 }
    }
    if (!melhor || det.score > melhor.detalhe.score) {
      melhor = { alvo: ex.nome, detalhe: det }
    }
  }

  if (!melhor) return { tipo: 'novo' }

  if (melhor.detalhe.score >= LIMITE_AUTO_MERGE) {
    return { tipo: 'auto_merge', alvo: melhor.alvo, score: melhor.detalhe.score, detalhe: melhor.detalhe }
  }
  if (melhor.detalhe.score >= LIMITE_REVISAO) {
    return { tipo: 'revisar', alvo: melhor.alvo, score: melhor.detalhe.score, detalhe: melhor.detalhe }
  }
  return { tipo: 'novo' }
}

/**
 * Acha todos os pares de duplicatas potenciais numa lista de nomes.
 * Usado pela tela "detective" pra revisar tudo de uma vez.
 *
 * Retorna apenas pares com score >= LIMITE_REVISAO, ordenados por score desc.
 * Pares já idênticos (score=1) são incluídos só se cidade diferente.
 */
export interface ParDuplicata {
  nomeA: string
  nomeB: string
  cidadeA?: string
  cidadeB?: string
  score: number
  detalhe: SimilaridadeDetalhe
}

export function encontrarPotenciaisDuplicatas(
  nomes: Array<{ nome: string; cidade?: string }>,
  limiteMin = LIMITE_REVISAO,
): ParDuplicata[] {
  const pares: ParDuplicata[] = []
  for (let i = 0; i < nomes.length; i++) {
    for (let j = i + 1; j < nomes.length; j++) {
      const det = calcularSimilaridade(
        nomes[i].nome,
        nomes[j].nome,
        nomes[i].cidade,
        nomes[j].cidade,
      )
      if (det.score >= limiteMin && det.score < 1) {
        pares.push({
          nomeA: nomes[i].nome,
          nomeB: nomes[j].nome,
          cidadeA: nomes[i].cidade,
          cidadeB: nomes[j].cidade,
          score: det.score,
          detalhe: det,
        })
      }
    }
  }
  return pares.sort((a, b) => b.score - a.score)
}
