// lib/contratos-download.ts
//
// Helper de front-end para abrir o PDF de um contrato privado.
// O navegador NÃO consegue chamar a rota /api/contratos/[id]/download
// usando um <a href> simples porque essa rota exige header
// "Authorization: Bearer <token>" — e tags <a> não enviam headers
// customizados.
//
// Este helper:
//   1. Faz fetch autenticado pra rota proxy
//   2. Recebe o PDF como Blob
//   3. Cria uma URL temporária (blob:) e abre em nova aba
//   4. Se o pop-up for bloqueado, força download
//   5. Limpa a URL depois de 1 minuto pra liberar memória

export const abrirContratoPDF = async (
  contratoId: string,
  arquivoNome: string | undefined,
  token: string | null,
): Promise<void> => {
  if (!token) {
    alert('Sessão expirada. Faça login novamente no painel de Contratos.')
    return
  }

  let resposta: Response
  try {
    resposta = await fetch(`/api/contratos/${contratoId}/download`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
  } catch (err: any) {
    alert(`Falha de rede ao buscar o arquivo.\n\nDetalhe: ${err?.message || 'desconhecido'}`)
    return
  }

  if (!resposta.ok) {
    let mensagem = `Erro ${resposta.status} ao buscar o PDF.`
    try {
      const dados = await resposta.json()
      if (dados?.erro) {
        mensagem = String(dados.erro)
        if (dados.detalhe) mensagem += `\n\nDetalhe: ${dados.detalhe}`
      }
    } catch {
      // Resposta sem JSON — fica com a mensagem padrão
    }
    if (resposta.status === 401) {
      mensagem += '\n\nSua sessão pode ter expirado. Recarregue a página e faça login de novo.'
    }
    alert(mensagem)
    return
  }

  let blob: Blob
  try {
    blob = await resposta.blob()
  } catch (err: any) {
    alert(`Não foi possível ler o arquivo recebido.\n\nDetalhe: ${err?.message || 'desconhecido'}`)
    return
  }

  const url = URL.createObjectURL(blob)
  const novaAba = window.open(url, '_blank')

  // Fallback: alguns navegadores bloqueiam window.open() por pop-up blocker.
  // Nesse caso, força um download via link <a>.
  if (!novaAba) {
    const link = document.createElement('a')
    link.href = url
    link.download = arquivoNome || 'contrato.pdf'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Libera a memória do blob URL depois de 1 minuto. Se a aba ainda estiver
  // aberta, o conteúdo já foi lido e o navegador não precisa mais da URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
