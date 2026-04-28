// lib/parser-folha.ts
// =============================================================================
// PARSER DEFINITIVO — Folha de Pagamento ETCO Tur
// Versão 2026-04-28 — Departamento Pessoal
// =============================================================================
//
// CHANGELOG 2026-04-28:
//
//   FIX 1 — findNameA agora aceita o nome da cidade e ignora candidatos
//           idênticos a ela. Resolve o bug em CASA BRANCA, onde o cabeçalho
//           do recibo ("CASA BRANCA" abaixo do nome do colaborador) era
//           retornado em vez do nome real, gerando 10 colaboradores
//           fantasmas com nome="Casa Branca" por importação.
//
//   FIX 2 — pareceNome / blacklist em camadas:
//           A blacklist anterior misturava palavras administrativas (BANCO,
//           CPF, INSS) com nomes de meses (MARCO, ABRIL...) e cidades
//           (PINHAL, AGUAI...) em uma lista única. Isso fazia com que
//           colaboradores como MARCO ANTONIO MENDES DE GODOI, MARCO AURÉLIO
//           DA SILVA e JOÃO MARCOS DE CAMPOS fossem rejeitados como "não é
//           nome de pessoa" e o pagamento deles fosse atribuído ao
//           colaborador anterior.
//
//           Solução: separar em duas listas:
//             1. BLACKLIST_HARD_WORDS: palavras administrativas que se
//                aparecerem em qualquer lugar do texto, NÃO é nome.
//             2. BLACKLIST_SOFT_WORDS: meses, nomes de cidades e fragmentos
//                de endereço. Aceita o nome se houver ao menos UMA palavra
//                "pessoal" (não-soft, não-stopword) no texto.
//
//           Validado contra os arquivos de Março/26 e Abril/26: 0 regressões
//           e MARCO ANTONIO / MARCO AURÉLIO / JOÃO MARCOS extraídos
//           corretamente em ambos os arquivos.
//
// FORMATOS DETECTADOS:
//   A) "TOTAL A RECEBER" simples — cidades de salário fixo (Águas Folha,
//      Morungaba, Casa Branca, Aguaí, Lindóia, Itapira Escolar, Mogi Mirim,
//      e parte do quadro de outras abas)
//   B) "1ª/2ª QUINZENA" — recibos quinzenais (Itapira Saúde, Pinhal, Mococa,
//      Rio Claro, Ubatuba, Águas Diárias)
//   C) Holerite tradicional — Porto Ferreira ("Funcionário:" + "Valor líquido")
// =============================================================================

import * as XLSX from 'xlsx';

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

export type AlvoExtracao = 'folha' | 'antecipacao';

export interface ColaboradorExtraido {
  nome: string;
  valor: number;
  cidade: string;
  linhaInicio: number;
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

const ABAS_PORTO_FERREIRA = new Set(['PORTO FERREIRA']);
const ABAS_IGNORAR = new Set(['TOTAL GERAL DA FOLHA']);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — Normalização
// ─────────────────────────────────────────────────────────────────────────────

function norm(s: unknown): string {
  if (s == null) return '';
  let str = String(s);
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  str = str.replace(/[ºª°]/g, '');
  str = str.replace(/\s+/g, ' ').trim().toUpperCase();
  return str;
}

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

type Cell = string | number | boolean | Date | null | undefined;
type Row = Cell[];

function firstPositiveAfter(row: Row, colIdx: number, maxLookahead = 12): number | null {
  const limit = Math.min(colIdx + maxLookahead, row.length);
  for (let c = colIdx + 1; c < limit; c++) {
    const v = row[c];
    if (typeof v === 'number' && v > 0) return v;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HEURÍSTICA DE NOMES — Blacklist em camadas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BLACKLIST_HARD_WORDS — palavras administrativas que se aparecerem como
 * palavra completa em qualquer lugar do texto, ele NÃO é nome de pessoa.
 * NÃO incluir aqui meses (MARCO, ABRIL...) nem cidades (PINHAL, AGUAI...),
 * porque colaboradores reais podem ter esses tokens no nome.
 */
const BLACKLIST_HARD_WORDS: readonly string[] = [
  'TOTAL', 'COMO', 'ETCO', 'PIX', 'BANCO', 'AGENCIA', 'CONTA',
  'ITAU', 'SANTANDER', 'CAIXA', 'NUBANK', 'CARGO', 'CHAVE', 'CPF', 'CNPJ',
  'NOME', 'HORA', 'AG', 'CC', 'VALE', 'INSS', 'INICIO', 'PERIODO',
  'AUXILIAR', 'AUXILIO', 'OPERADOR', 'MOTORISTA', 'MECANICO',
  'MONITOR', 'MONITORA', 'EMPRESA', 'TURISMO', 'RECIBO', 'VALOR',
  'PARC', 'EXTRAS', 'LINHAS', 'CESTA', 'BASICA', 'GRAVIDA',
  'DESCONTOS', 'REEMBOLSO', 'RG', 'OP', 'REFERENCIA', 'OBS',
  'VEICULO', 'VEICULOS', 'PREFIXO', 'DATA', 'DESTINO', 'MES', 'SP', 'SE',
  'TAIS', 'ADICIONAL', 'SERVICO', 'SERVICOS', 'AJUDANTE', 'EXTRA',
  'NOTURNO', 'CIDADE', 'MUDOU', 'ATENCAO',
];

const BLACKLIST_PREFIXES: readonly string[] = [
  'ANTECIP', 'BONIFICA', 'SALARI', 'DESCONT', 'DECLARO',
  'REAJUST', 'REEMBOLS', 'ENCARREG', 'RECEB', 'REFERENT',
  'CONFIANC', 'BENEFICIO', 'CONSERTO', 'FREIO', 'FACUL',
  'LAVAGEM', 'LICEN', 'REGISTR', 'FAMILIA', 'QUINZEN', 'DIARIA',
];

/**
 * BLACKLIST_SOFT_WORDS — meses, nomes de cidades e fragmentos de endereço.
 * Tokens permitidos em nomes de pessoa, mas se TODAS as palavras úteis do
 * texto pertencerem a esta lista, é uma descrição/cidade e não um nome.
 */
const BLACKLIST_SOFT_WORDS: ReadonlySet<string> = new Set([
  'MARCO', 'ABRIL', 'JANEIRO', 'FEVEREIRO', 'MAIO', 'JUNHO', 'JULHO',
  'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
  'MOGI', 'MORUNGABA', 'LINDOIA', 'AGUAS', 'AGUAI', 'MOCOCA', 'PINHAL',
  'UBATUBA', 'ITAPIRA', 'ESCOLAR', 'SAUDE', 'BRANCA', 'CASA',
  'SAO', 'SJ', 'CLARO', 'RIO', 'FERREIRA', 'PORTO', 'MIRIM',
  'BOA', 'VISTA', 'PAULO', 'SANTO', 'ESPIRITO', 'STO', 'J', 'JOAO',
]);

const STOP_WORDS: ReadonlySet<string> = new Set([
  'DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'A', 'O',
]);

function hasHardBlacklist(text: string): boolean {
  const t = norm(text);
  for (let i = 0; i < BLACKLIST_HARD_WORDS.length; i++) {
    const re = new RegExp(`\\b${BLACKLIST_HARD_WORDS[i]}\\b`);
    if (re.test(t)) return true;
  }
  for (let i = 0; i < BLACKLIST_PREFIXES.length; i++) {
    if (t.includes(BLACKLIST_PREFIXES[i])) return true;
  }
  return false;
}

function pareceNome(text: unknown): boolean {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < 5 || t.length > 80) return false;
  if (!t.includes(' ')) return false;
  if (/\d/.test(t)) return false;
  if (t.startsWith('_')) return false;

  if (hasHardBlacklist(t)) return false;

  const tNorm = norm(t).replace(/[/.,\-()]/g, ' ');
  const palavras = tNorm.split(/\s+/).filter((p) => p && !STOP_WORDS.has(p));
  if (palavras.length === 0) return false;

  let palavrasPessoais = 0;
  for (const p of palavras) {
    if (!BLACKLIST_SOFT_WORDS.has(p)) palavrasPessoais++;
  }
  if (palavrasPessoais === 0) return false;

  return true;
}

function findNameB(rows: Row[], lineIdx: number): string | null {
  const minJ = Math.max(lineIdx - 80, 0);
  for (let j = lineIdx - 1; j >= minJ; j--) {
    const row = rows[j];
    if (!row) continue;
    const colsToCheck = Math.min(7, row.length);
    for (let c = 0; c < colsToCheck; c++) {
      const v = row[c];
      if (typeof v === 'string' && norm(v) === 'NOME') {
        let hasId = false;
        for (let cc = 0; cc < colsToCheck; cc++) {
          const tt = norm(row[cc]);
          if (tt === 'CPF' || tt === 'CPF:' || tt === 'CNPJ' || tt === 'CNPJ:') {
            hasId = true;
            break;
          }
        }
        if (!hasId) continue;

        const nx = rows[j + 1];
        if (!nx) continue;

        const lim1 = Math.min(c + 3, nx.length);
        for (let cc = c; cc < lim1; cc++) {
          const v2 = nx[cc];
          if (typeof v2 === 'string') {
            const tt = v2.trim();
            if (tt.length > 4 && tt.length < 80 && tt.includes(' ') && !/\d{3}/.test(tt)) {
              return tt;
            }
          }
        }

        if (nx.length > 0) {
          const v0 = nx[0];
          if (typeof v0 === 'string') {
            const tt = v0.trim();
            if (tt.length > 4 && tt.length < 80 && tt.includes(' ') && !/\d{3}/.test(tt)) {
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
 * Encontra o nome no formato A. Pula candidatos cujo texto seja idêntico ao
 * nome da aba (cidade), porque nos recibos o nome da cidade aparece como
 * cabeçalho logo abaixo do nome do colaborador.
 */
function findNameA(rows: Row[], lineIdx: number, cidadeNome?: string): string | null {
  const cidadeNorm = cidadeNome ? norm(cidadeNome) : null;
  const minJ = Math.max(lineIdx - 30, 0);
  for (let j = lineIdx - 1; j >= minJ; j--) {
    const row = rows[j];
    if (!row) continue;
    const colsToCheck = Math.min(2, row.length);
    for (let c = 0; c < colsToCheck; c++) {
      const v = row[c];
      if (pareceNome(v)) {
        const candidato = (v as string).trim();
        if (cidadeNorm && norm(candidato) === cidadeNorm) continue;
        return candidato;
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
// EXTRAÇÃO — Pass A
// ─────────────────────────────────────────────────────────────────────────────

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

const ZONA_ANTES_TOTAL = 18;
const ZONA_DEPOIS_TOTAL = 5;

function extractPassA2(
  rows: Row[],
  zonasUsadasB: Set<number>,
  target: AlvoExtracao,
): ResultadoQuadro[] {
  if (target !== 'antecipacao') return [];

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
        break;
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
          break;
        }
      }
    }
  }
  return out;
}

function parseAbaQuinzenal(
  rows: Row[],
  cidade: string,
  target: AlvoExtracao,
): ColaboradorExtraido[] {
  const qB = extractPassB(rows, target);

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
    const nome = findNameA(rows, q.inicio, cidade) || '?';
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
    const nome = findNameA(rows, q.inicio, cidade) || '?';
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

function parseAbaPortoFerreira(
  rows: Row[],
  cidade: string,
  _target: AlvoExtracao,
): ColaboradorExtraido[] {
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
// API PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export function parseFolhaPagamento(
  dadosArquivo: ArrayBuffer | Buffer | Uint8Array,
  target: AlvoExtracao = 'folha',
): ResultadoParser {
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

export function achatarColaboradores(r: ResultadoParser): ColaboradorExtraido[] {
  return r.abas.flatMap((a) => a.colaboradores);
}
