// src/lib/theme.ts
// Paleta dark premium azul + dourado champanhe.
// Importe deste arquivo em todos os componentes para manter consistência.

export const theme = {
  // ====== Backgrounds ======
  bg: '#0a0f1f',          // fundo principal (deep navy)
  bgPanel: '#0f1830',     // painéis/cards
  bgPanel2: '#152340',    // hover/elevado
  bgPanel3: '#1c2d50',    // ainda mais elevado
  bgHeader: '#0d1428',    // header (mais escuro que o painel)

  // ====== Bordas ======
  border: '#1e2d4f',
  borderStrong: '#2a3d68',
  borderGold: '#d4b86a30',  // toque sutil dourado para premium

  // ====== Texto ======
  ink: '#e8edf7',         // texto principal
  ink2: '#aab5cc',         // texto secundário
  muted: '#6b7896',        // texto terciário
  muted2: '#475066',

  // ====== Acentos ======
  accent: '#4a9eff',       // azul vibrante (principal)
  accent2: '#6db3ff',      // azul claro
  accent3: '#2a7fd9',      // azul profundo
  accentSoft: '#4a9eff15', // background translúcido

  // ====== Dourado champanhe (toque luxo) ======
  gold: '#d4b86a',
  goldSoft: '#a8924d',
  goldBg: '#d4b86a15',

  // ====== Status ======
  red: '#f87171',
  redSoft: '#f8717115',
  amber: '#fbbf24',
  amberSoft: '#fbbf2415',
  green: '#3ecf8e',
  greenSoft: '#3ecf8e15',
  violet: '#a78bfa',
  violetSoft: '#a78bfa15',
  teal: '#14b8a6',
  tealSoft: '#14b8a615',

  // ====== Cores semânticas para situação de contratos ======
  situacao: {
    vigente:        { bg: '#3ecf8e15', border: '#3ecf8e40', text: '#3ecf8e' },
    vencendo:       { bg: '#fbbf2415', border: '#fbbf2440', text: '#fbbf24' },
    vencendo_60:    { bg: '#facc1515', border: '#facc1540', text: '#facc15' },
    em_renovacao:   { bg: '#4a9eff15', border: '#4a9eff40', text: '#6db3ff' },
    encerrado:      { bg: '#475066',   border: '#475066',   text: '#94a3b8' },
    vencido:        { bg: '#f8717115', border: '#f8717140', text: '#f87171' },
  },
}

// ====== Estilos compartilhados ======
export const sharedStyles = {
  cardPanel: {
    background: theme.bgPanel,
    border: `1px solid ${theme.border}`,
    borderRadius: 12,
  } as React.CSSProperties,

  input: {
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    fontSize: 13,
    background: theme.bgPanel2,
    color: theme.ink,
    fontFamily: 'inherit',
    outline: 'none',
  } as React.CSSProperties,

  select: {
    padding: '10px 12px',
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    fontSize: 13,
    background: theme.bgPanel2,
    color: theme.ink,
    fontFamily: 'inherit',
    outline: 'none',
    cursor: 'pointer',
  } as React.CSSProperties,

  buttonPrimary: {
    padding: '10px 18px',
    background: `linear-gradient(135deg, ${theme.accent} 0%, ${theme.accent3} 100%)`,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: `0 4px 12px ${theme.accent}40`,
    transition: 'all 0.15s',
  } as React.CSSProperties,

  buttonGhost: {
    padding: '10px 18px',
    background: theme.bgPanel3,
    color: theme.ink2,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  } as React.CSSProperties,

  // Background com luzes sutis (radial gradients de azul + dourado)
  pageBg: {
    background: theme.bg,
    backgroundImage: `
      radial-gradient(ellipse 800px 600px at 20% -10%, rgba(74,158,255,0.06), transparent 60%),
      radial-gradient(ellipse 600px 400px at 90% 110%, rgba(212,184,106,0.04), transparent 60%)
    `,
  } as React.CSSProperties,
}
