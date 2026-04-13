import * as XLSX from 'xlsx'

export function exportarXLSX(
  nomeArquivo: string,
  cabecalho: string[],
  linhas: (string | number | null | undefined)[][],
  comTotal?: boolean
) {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([cabecalho, ...linhas])

  // Estilo da largura das colunas
  ws['!cols'] = cabecalho.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...linhas.map(r => String(r[i] ?? '').length)
    )
    return { wch: Math.min(Math.max(maxLen + 2, 10), 40) }
  })

  // Linha de total automática
  if (comTotal && linhas.length > 0) {
    const totalRow: (string | number)[] = cabecalho.map((h, i) => {
      if (i === 0) return 'TOTAL'
      // Somar colunas numéricas
      const vals = linhas.map(r => typeof r[i] === 'number' ? r[i] as number : null).filter(v => v !== null) as number[]
      return vals.length > 0 ? parseFloat(vals.reduce((a, b) => a + b, 0).toFixed(3)) : ''
    })
    XLSX.utils.sheet_add_aoa(ws, [totalRow], { origin: -1 })
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Dados')
  XLSX.writeFile(wb, nomeArquivo)
}
