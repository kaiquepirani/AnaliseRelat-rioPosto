export const abrirContratoPDF = async (
  contratoId: string,
  arquivoNome: string | undefined,
  token: string,
): Promise<void> => {
  try {
    const r = await fetch(`/api/contratos/${contratoId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) {
      alert('Não foi possível abrir o arquivo.')
      return
    }
    const blob = await r.blob()
    const url = URL.createObjectURL(blob)
    const novaAba = window.open(url, '_blank')
    if (!novaAba) {
      const link = document.createElement('a')
      link.href = url
      link.download = arquivoNome || 'contrato.pdf'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch {
    alert('Falha de rede ao buscar o arquivo.')
  }
}
