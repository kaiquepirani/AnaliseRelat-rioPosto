// lib/parser-folha.ts
// =============================================================================
// PARSER DEFINITIVO — Folha de Pagamento ETCO Tur
// Versão 2026-04-26 — Departamento Pessoal
// =============================================================================
//
// Esta é uma reescrita completa, validada contra o arquivo real
// "03_Folha_de_Pagamento_-_Março_-26_-_10-04-26.xlsx" (490.910,24 oficial).
//
// FORMATOS DETECTADOS:
//   A) "TOTAL A RECEBER" simples — cidades de salário fixo (Águas Folha,
//      Morungaba, Casa Branca, Aguaí, Lindóia, Itapira Escolar, Mogi Mirim,
//      e parte do quadro de outras abas)
//   B) "1ª/2ª QUINZENA" — recibos quinzenais (Itapira Saúde, Pinhal, Mococa,
//      Rio Claro, Ubatuba, Águas Diárias)
//   C) Holerite tradicional — Porto Ferreira ("Funcionário:" + "Valor líquido")
//
// VARIAÇÕES TEXTUAIS já tratadas:
//   - "TOTAL A RECEBIDO NA 2 QUINZENA" / "TOTAL  RECEBIRO NA 2 QUINZENA" (typo)
//   - "TOTAL RECEBIDO NA 2º QUINZENA" / "TOTAL A RECEBER 2ºQUINZENA"
//   - "TOTAL RECBIDO NO MÊS" / "TOTAL LIQUIDO RECEBIDO NO MÊS"
//   - Ordinais "º" / "ª" / "°" / com ou sem espaço
//   - Acentos / dupla espaço / typo "RECEBIRO" e "RECBIDO"
//
// VALIDAÇÃO:
//
// FOLHA DO DIA 10 (Março/26 — 490.910,24 oficial):
//   13/14 abas com diff = 0 ou explicado.
//   - Aguaí +300:    Vitor Tadeu Faria (prestador avulso "conserto freio")
//   - Mococa +5151:  Willian A. de Lima recebe 2 recibos (CPF + CNPJ)
//   - Lindóia -120:  1 colaborador com nome em formato atípico
//   - Itapira Esc +35: micro-discrepância de arredondamento
//
// ANTECIPAÇÃO DO DIA 20 (Março/26 — 351.705,91 oficial):
//   13/14 abas com diff = 0.
//   - Itapira Esc +34: 1 quadro de antecipação capturado a mais (~0,01%)
//
// AMBOS OS ARQUIVOS (erro humano comum):
//   - Mogi Mirim/Águas Diárias ±13.900 (folha) ou ±12.580 (antecipação):
//     6 quadros estão fisicamente na aba MOGI MIRIM mas pertencem
//     logicamente a ÁGUAS DIÁRIAS. Total geral fica correto;
//     distribuição por cidade fica errada para esses 6 colaboradores.
// =============================================================================

import * as XLSX from 'xlsx';

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

export type AlvoExtracao = 'folha' | 'antecipacao';

export interface ColaboradorExtraido {
  nome: string;
  valor: number;
  cidade: string;        // nome da aba normalizado
  linhaInicio: number;   // 1-based, para diagnóstico
  origem: 'q2' | 'q1' | 'mes' | 'mes-q1' | 'total' | 'antecip' | 'liq';
  formato: 'A' | 'B' | 'C';
}

export interface ResultadoAba {
  cidade: string;
  colaboradores: ColaboradorExtraido[];
  totalAba: number;
}

export interface ResultadoParser {
  abas: ResultadoAba[];
  totalGeral: number;
  totalColaboradores: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES — Lista de abas tratadas como Porto Ferreira
// ─────────────────────────────────────────────────────────────────────────────

const ABAS_PORTO_FERREIRA = new Set(['PORTO FERREIRA']);

const ABAS_IGNORAR = new Set(['TOTAL GERAL DA FOLHA']);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — Normalização de texto
// ─────────────────────────────────────────────────────────────────────────────

/** Remove acentos, ordinais (º/ª/°), normaliza whitespace, uppercase */
function norm(s: unknown): string {
  if (s == null) return '';
  let str = String(s);
  // Remove diacríticos
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Remove ordinais
  str = str.replace(/[ºª°]/g, '');
  // Collapse whitespace
  str = str.replace(/\s+/g, ' ').trim().toUpperCase();
  return str;
}

/** Detectores de palavras-chave (usam texto já normalizado) */
function isQ1(t: string): boolean {
  if (!t.includes('QUINZENA')) return false;
  if (!/\b1\s*QUINZENA/.test(t)) return false;
  return t.includes('TOTAL') || t.includes('RECEB');
}

function isQ2(t: string): boolean {
  if (!t.includes('QUINZENA')) return false;
  if (!/\b2\s*QUINZENA/.test(t)) return false;
  return t.includes('TOTAL') || t.includes('RECEB');
}

function isTotalSimples(t: string): boolean {
  if (!t.includes('TOTAL A RECEBER') && !t.includes('TOTAL  A RECEBER')) return false;
  if (t.includes('QUINZENA')) return false;
  if (t.includes('MES')) return false;
  return true;
}

function isTotalMes(t: string): boolean {
  return (
    t.includes('RECEBIDO NO MES') ||
    t.includes('RECEBER NO MES') ||
    t.includes('RECBIDO NO MES') ||
    t.includes('LIQUIDO RECEBIDO NO MES')
  );
}

function isAntecipacao(t: string): boolean {
  return t.includes('ANTECIPACAO SALARIAL');
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — Acesso à matriz de células (linha = array de células)
// ─────────────────────────────────────────────────────────────────────────────

type Cell = string | number | boolean | Date | null | undefined;
type Row = Cell[];

/** Primeiro número positivo numa linha após uma coluna dada */
function firstPositiveAfter(row: Row, colIdx: number, maxLookahead = 12): number | null {
  const limit = Math.min(colIdx + maxLookahead, row.length);
  for (let c = colIdx + 1; c < limit; c++) {
    const v = row[c];
    if (typeof v === 'number' && v > 0) return v;
  }
  return null;
}

/** Lê o valor de uma célula respeitando boolean→ignorado, Date→string */
function cellValue(row: Row, idx: number): Cell {
  if (idx < 0 || idx >= row.length) return null;
  return row[idx];
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — Detecção de nomes (heurística com blacklist)
// ─────────────────────────────────────────────────────────────────────────────

/** Palavras inteiras que NUNCA aparecem em nome de pessoa */
const BLACKLIST_WORDS: readonly string[] = [
  'TOTAL', 'COMO', 'ETCO', 'PIX', 'BANCO', 'AGENCIA', 'CONTA',
  'ITAU', 'SANTANDER', 'CAIXA', 'NUBANK', 'CARGO', 'CHAVE', 'CPF', 'CNPJ',
  'NOME', 'HORA', 'AG', 'CC', 'VALE', 'INSS', 'INICIO', 'PERIODO',
  'AUXILIAR', 'AUXILIO', 'OPERADOR', 'MOTORISTA', 'MECANICO',
  'MONITOR', 'MONITORA', 'EMPRESA', 'TURISMO', 'RECIBO', 'VALOR',
  'PARC', 'EXTRAS', 'LINHAS', 'CESTA', 'BASICA', 'MARCO', 'ABRIL',
  'TAIS', 'GRAVIDA', 'MOGI', 'MORUNGABA', 'LINDOIA', 'AGUAS', 'AGUAI',
  'MOCOCA', 'PINHAL', 'UBATUBA', 'ITAPIRA', 'ESCOLAR', 'SAUDE',
  'DESCONTOS', 'REEMBOLSO', 'JANEIRO', 'FEVEREIRO', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
  'RG', 'OP', 'REFERENCIA', 'OBS', 'VEICULO', 'VEICULOS', 'PREFIXO',
  'DATA', 'DESTINO', 'MES', 'SP', 'SE',
];

/** Prefixos/substrings que indicam cabeçalho/descrição (não-nome) */
const BLACKLIST_PREFIXES: readonly string[] = [
  'ANTECIP', 'BONIFICA', 'SALARI', 'DESCONT', 'DECLARO',
  'REAJUST', 'REEMBOLS', 'ENCARREG', 'RECEB', 'REFERENT',
  'CONFIANC', 'BENEFICIO', 'CONSERTO', 'FREIO', 'FACUL',
  'LAVAGEM', 'LICEN', 'REGISTR', 'FAMILIA', 'QUINZEN', 'DIARIA',
];

/** True se texto tem palavra ou prefixo proibido */
function hasBlacklist(text: string): boolean {
  const t = norm(text);
  for (let i = 0; i < BLACKLIST_WORDS.length; i++) {
    const re = new RegExp(`\\b${BLACKLIST_WORDS[i]}\\b`);
    if (re.test(t)) return true;
  }
  for (let i = 0; i < BLACKLIST_PREFIXES.length; i++) {
    if (t.includes(BLACKLIST_PREFIXES[i])) return true;
  }
  return false;
}

/** Heurística: o texto parece nome de pessoa? */
function pareceNome(text: unknown): boolean {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < 5 || t.length > 80) return false;
  if (!t.includes(' ')) return false; // exige 2+ palavras
  if (/\d/.test(t)) return false;     // sem dígitos
  if (t.startsWith('_')) return false;
  if (hasBlacklist(t)) return false;
  return true;
}

/**
 * Encontra o nome do colaborador no formato B (cabeçalho NOME + CPF/CNPJ
 * acima da linha do evento).
 */
function findNameB(rows: Row[], lineIdx: number): string | null {
  const minJ = Math.max(lineIdx - 80, 0);
  for (let j = lineIdx - 1; j >= minJ; j--) {
    const row = rows[j];
    if (!row) continue;
    const colsToCheck = Math.min(7, row.length);
    for (let c = 0; c < colsToCheck; c++) {
      const v = row[c];
      if (typeof v === 'string' && norm(v) === 'NOME') {
        // Verifica se na MESMA linha tem CPF/CNPJ (cabeçalho de quadro)
        let hasId = false;
        for (let cc = 0; cc < colsToCheck; cc++) {
          const tt = norm(row[cc]);
          if (tt === 'CPF' || tt === 'CPF:' || tt === 'CNPJ' || tt === 'CNPJ:') {
            hasId = true;
            break;
          }
        }
        if (!hasId) continue;

        // Próxima linha (j+1) tem o nome
        const nx = rows[j + 1];
        if (!nx) continue;

        // Tentativa 1: na mesma coluna do "NOME"
        const lim1 = Math.min(c + 3, nx.length);
        for (let cc = c; cc < lim1; cc++) {
          const v2 = nx[cc];
          if (typeof v2 === 'string') {
            const tt = v2.trim();
            if (
              tt.length > 4 &&
              tt.length < 80 &&
              tt.includes(' ') &&
              !/\d{3}/.test(tt)
            ) {
              return tt;
            }
          }
        }

        // Tentativa 2: col 0 (caso Mogi Mirim com NOME col0, CPF col2)
        if (nx.length > 0) {
          const v0 = nx[0];
          if (typeof v0 === 'string') {
            const tt = v0.trim();
            if (
              tt.length > 4 &&
              tt.length < 80 &&
              tt.includes(' ') &&
              !/\d{3}/.test(tt)
            ) {
              return tt;
            }
          }
        }
      }
    }
  }
  return null;
}

/**
 * Encontra o nome no formato A (linha solta antes do "TOTAL A RECEBER",
 * tipicamente em col 0 ou col 1 da primeira linha do quadro).
 */
function findNameA(rows: Row[], lineIdx: number): string | null {
  const minJ = Math.max(lineIdx - 30, 0);
  for (let j = lineIdx - 1; j >= minJ; j--) {
    const row = rows[j];
    if (!row) continue;
    const colsToCheck = Math.min(2, row.length);
    for (let c = 0; c < colsToCheck; c++) {
      const v = row[c];
      if (pareceNome(v)) {
        return (v as string).trim();
      }
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRAÇÃO — Pass B (recibos com 1ª/2ª QUINZENA)
// ─────────────────────────────────────────────────────────────────────────────

interface QuadroB {
  inicio: number;
  fim: number;
  q1: number | null;
  q2: number | null;
  mes: number | null;
}

interface ResultadoQuadro {
  inicio: number;
  fim: number;
  valor: number;
  origem: ColaboradorExtraido['origem'];
}

function extractPassB(rows: Row[], target: AlvoExtracao): ResultadoQuadro[] {
  // Coletar todos os eventos (linha, tipo, valor)
  type Evento = { linha: number; tipo: 'q1' | 'q2' | 'mes'; valor: number };
  const eventos: Evento[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const limCol = Math.min(7, row.length);
    for (let col = 0; col < limCol; col++) {
      const val = row[col];
      if (typeof val !== 'string') continue;
      const t = norm(val);
      const v = firstPositiveAfter(row, col);
      if (v == null) continue;

      if (isQ1(t)) eventos.push({ linha: i, tipo: 'q1', valor: v });
      else if (isQ2(t)) eventos.push({ linha: i, tipo: 'q2', valor: v });
      else if (isTotalMes(t)) eventos.push({ linha: i, tipo: 'mes', valor: v });
    }
  }

  // Agrupar eventos próximos em quadros
  const quadros: QuadroB[] = [];
  let atual: (QuadroB & { ult: number }) | null = null;
  for (const ev of eventos) {
    if (!atual || ev.linha - atual.ult > 10) {
      if (atual) quadros.push(atual);
      atual = {
        inicio: ev.linha,
        fim: ev.linha,
        q1: null,
        q2: null,
        mes: null,
        ult: ev.linha,
      };
    }
    atual[ev.tipo] = ev.valor;
    atual.ult = ev.linha;
    atual.fim = ev.linha;
  }
  if (atual) quadros.push(atual);

  // Calcular valor por target (folha vs antecipação)
  const out: ResultadoQuadro[] = [];
  for (const q of quadros) {
    let valor: number | null = null;
    let origem: ColaboradorExtraido['origem'] = 'q2';

    if (target === 'folha') {
      if (q.q2 != null) {
        valor = q.q2;
        origem = 'q2';
      } else if (q.mes != null && q.q1 != null) {
        valor = q.mes - q.q1;
        origem = 'mes-q1';
      } else if (q.mes != null) {
        valor = q.mes;
        origem = 'mes';
      }
    } else {
      // antecipacao
      if (q.q1 != null) {
        valor = q.q1;
        origem = 'q1';
      }
    }

    if (valor != null && valor > 0) {
      out.push({ inicio: q.inicio, fim: q.fim, valor, origem });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRAÇÃO — Pass A ("TOTAL A RECEBER" simples — líquido a pagar)
// ─────────────────────────────────────────────────────────────────────────────
//
// IMPORTANTE: tanto na FOLHA quanto na ANTECIPAÇÃO, o "TOTAL A RECEBER" é
// o valor líquido a pagar. Ele é o mesmo rótulo nos dois arquivos — muda
// apenas a composição do cálculo (na folha desconta antecipação, na
// antecipação inclui antecipação + 1ª quinzena de diárias). Por isso este
// pass NÃO depende do target.

function extractPassA(rows: Row[], zonasUsadasB: Set<number>): ResultadoQuadro[] {
  const out: ResultadoQuadro[] = [];

  for (let i = 0; i < rows.length; i++) {
    if (zonasUsadasB.has(i)) continue;
    const row = rows[i];
    if (!row) continue;

    const limCol = Math.min(7, row.length);
    for (let col = 0; col < limCol; col++) {
      const val = row[col];
      if (typeof val !== 'string') continue;
      const t = norm(val);

      if (isTotalSimples(t)) {
        const v = firstPositiveAfter(row, col);
        if (v != null && v > 0) {
          out.push({ inicio: i, fim: i, valor: v, origem: 'total' });
        }
      }
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRAÇÃO — Pass A2 (fallback para quadros sem "TOTAL A RECEBER")
// ─────────────────────────────────────────────────────────────────────────────
//
// Alguns quadros da antecipação NÃO têm a linha "TOTAL A RECEBER" — só têm
// "ANTECIPAÇÃO SALARIAL" e o valor repetido em outra linha sem rótulo
// (afastados pelo INSS, recém-contratados, etc).
//
// Este pass pega esses casos: procura "ANTECIPAÇÃO SALARIAL" que NÃO está
// num raio de ±N linhas de um "TOTAL A RECEBER" (que indicaria que faz
// parte de um quadro normal — antecipação dentro de quadro completo NÃO é
// dupla-contagem, ela é apenas a parte que compõe o TOTAL).
//
// Zona de exclusão: 18 linhas ANTES e 5 DEPOIS de cada TOTAL A RECEBER.
// (Antecipação tipicamente fica 3-15 linhas ANTES do total no mesmo quadro.)

const ZONA_ANTES_TOTAL = 18;
const ZONA_DEPOIS_TOTAL = 5;

function extractPassA2(
  rows: Row[],
  zonasUsadasB: Set<number>,
  target: AlvoExtracao,
): ResultadoQuadro[] {
  if (target !== 'antecipacao') return [];

  // Marca zonas de cada TOTAL A RECEBER (raio para os dois lados)
  const zonasTotal = new Set<number>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const limCol = Math.min(7, row.length);
    for (let col = 0; col < limCol; col++) {
      const val = row[col];
      if (typeof val !== 'string') continue;
      if (isTotalSimples(norm(val))) {
        const start = Math.max(0, i - ZONA_ANTES_TOTAL);
        const end = Math.min(rows.length, i + ZONA_DEPOIS_TOTAL + 1);
        for (let j = start; j < end; j++) zonasTotal.add(j);
        break; // uma marcação por linha
      }
    }
  }

  const out: ResultadoQuadro[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (zonasUsadasB.has(i) || zonasTotal.has(i)) continue;
    const row = rows[i];
    if (!row) continue;
    const limCol = Math.min(7, row.length);
    for (let col = 0; col < limCol; col++) {
      const val = row[col];
      if (typeof val !== 'string') continue;
      const t = norm(val);
      if (isAntecipacao(t)) {
        const v = firstPositiveAfter(row, col);
        if (v != null && v > 0) {
          out.push({ inicio: i, fim: i, valor: v, origem: 'antecip' });
          break; // uma por linha
        }
      }
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSER PRINCIPAL POR ABA — Combina Pass B + Pass A
// ─────────────────────────────────────────────────────────────────────────────

function parseAbaQuinzenal(
  rows: Row[],
  cidade: string,
  target: AlvoExtracao,
): ColaboradorExtraido[] {
  const qB = extractPassB(rows, target);

  // Marca zonas usadas pelos quadros B (margem de ±3/+5 linhas)
  const zonas = new Set<number>();
  for (const q of qB) {
    const start = Math.max(0, q.inicio - 3);
    const end = q.fim + 5;
    for (let ln = start; ln <= end; ln++) zonas.add(ln);
  }

  const qA = extractPassA(rows, zonas);
  const qA2 = extractPassA2(rows, zonas, target);

  const out: ColaboradorExtraido[] = [];
  for (const q of qB) {
    const nome = findNameB(rows, q.inicio) || '?';
    out.push({
      nome,
      valor: q.valor,
      cidade,
      linhaInicio: q.inicio + 1,
      origem: q.origem,
      formato: 'B',
    });
  }
  for (const q of qA) {
    const nome = findNameA(rows, q.inicio) || '?';
    out.push({
      nome,
      valor: q.valor,
      cidade,
      linhaInicio: q.inicio + 1,
      origem: q.origem,
      formato: 'A',
    });
  }
  for (const q of qA2) {
    const nome = findNameA(rows, q.inicio) || '?';
    out.push({
      nome,
      valor: q.valor,
      cidade,
      linhaInicio: q.inicio + 1,
      origem: q.origem,
      formato: 'A',
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSER ESPECIAL — Porto Ferreira (holerite "Funcionário:" + "Valor líquido")
// ─────────────────────────────────────────────────────────────────────────────

function parseAbaPortoFerreira(
  rows: Row[],
  cidade: string,
  _target: AlvoExtracao, // Porto Ferreira usa "Valor líquido" em ambos os casos
): ColaboradorExtraido[] {
  // Em ambos os arquivos (folha E antecipação) o Porto Ferreira usa o mesmo
  // formato de holerite: "Funcionário:" identifica o colaborador, e
  // "Valor líquido" é o que será efetivamente pago. O título do recibo muda
  // ("Recibo de Pagamento de Salário" vs "Recibo de Pagamento de Vale"),
  // mas a estrutura interna é idêntica.

  type Funcionario = { linha: number; nome: string };
  type ValorLiquido = { linha: number; valor: number };

  const funcionarios: Funcionario[] = [];
  const valoresLiq: ValorLiquido[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const limCol = Math.min(9, row.length);
    for (let col = 0; col < limCol; col++) {
      const val = row[col];
      if (typeof val !== 'string') continue;
      const t = norm(val);

      if (t === 'FUNCIONARIO:' || t === 'FUNCIONARIO') {
        const limN = Math.min(col + 5, row.length);
        for (let c = col + 1; c < limN; c++) {
          const v2 = row[c];
          if (typeof v2 === 'string' && v2.trim().length > 3) {
            funcionarios.push({ linha: i, nome: v2.trim() });
            break;
          }
        }
      } else if (t.includes('VALOR LIQUIDO')) {
        const v = firstPositiveAfter(row, col, 10);
        if (v != null) valoresLiq.push({ linha: i, valor: v });
      }
    }
  }

  // Pareia cada funcionário com o próximo "Valor líquido" abaixo
  const out: ColaboradorExtraido[] = [];
  for (const f of funcionarios) {
    for (const vl of valoresLiq) {
      if (vl.linha > f.linha && vl.linha - f.linha < 30) {
        out.push({
          nome: f.nome,
          valor: vl.valor,
          cidade,
          linhaInicio: f.linha + 1,
          origem: 'liq',
          formato: 'C',
        });
        break;
      }
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// API PRINCIPAL — Lê o ArrayBuffer/Buffer do XLSX e devolve estrutura completa
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Faz o parsing de uma folha de pagamento em xlsx.
 *
 * @param dadosArquivo  ArrayBuffer (frontend) ou Buffer (backend) do .xlsx
 * @param target        'folha' (pega 2ª quinzena/líquido) ou 'antecipacao' (1ª quinzena)
 * @returns ResultadoParser com colaboradores agrupados por cidade
 */
export function parseFolhaPagamento(
  dadosArquivo: ArrayBuffer | Buffer | Uint8Array,
  target: AlvoExtracao = 'folha',
): ResultadoParser {
  // Aceita qualquer entrada (ArrayBuffer, Buffer, Uint8Array)
  const wb = XLSX.read(dadosArquivo, { type: 'array', cellDates: true });

  const abas: ResultadoAba[] = [];
  let totalGeral = 0;
  let totalColaboradores = 0;

  for (const sheetName of wb.SheetNames) {
    const cidadeNorm = norm(sheetName);
    if (ABAS_IGNORAR.has(cidadeNorm)) continue;

    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, {
      header: 1,
      defval: null,
      raw: true,
    }) as Row[];

    let colaboradores: ColaboradorExtraido[];
    if (ABAS_PORTO_FERREIRA.has(cidadeNorm)) {
      colaboradores = parseAbaPortoFerreira(rows, sheetName.trim(), target);
    } else {
      colaboradores = parseAbaQuinzenal(rows, sheetName.trim(), target);
    }

    const totalAba = colaboradores.reduce((s, c) => s + c.valor, 0);
    abas.push({ cidade: sheetName.trim(), colaboradores, totalAba });
    totalGeral += totalAba;
    totalColaboradores += colaboradores.length;
  }

  return { abas, totalGeral, totalColaboradores };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER PÚBLICO — Achata todos os colaboradores em uma lista única
// (Útil quando você quer iterar sem se importar com a aba)
// ─────────────────────────────────────────────────────────────────────────────

export function achatarColaboradores(r: ResultadoParser): ColaboradorExtraido[] {
  return r.abas.flatMap((a) => a.colaboradores);
}
