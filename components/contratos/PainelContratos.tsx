const importarPDF = async (file: File) => {
    setImportando(true)
    try {
      const tamanhoMB = (file.size / 1024 / 1024).toFixed(2)
      if (file.size > 25 * 1024 * 1024) {
        alert(`Arquivo muito grande (${tamanhoMB} MB). O limite é 25 MB.`)
        return
      }

      // 1. Faz upload do PDF pro Blob primeiro (isso nunca dá timeout)
      const fdUp = new FormData()
      fdUp.append('file', file)
      const rUp = await fetch('/api/contratos/upload', {
        method: 'POST', headers, body: fdUp,
      })
      if (!rUp.ok) {
        const dUp = await rUp.json().catch(() => ({}))
        alert(dUp.erro || 'Falha ao enviar o PDF')
        return
      }
      const upData = await rUp.json()

      // 2. Chama a IA passando só a URL do Blob (body minúsculo, sem limite de tamanho)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 70000)

      let r: Response
      try {
        r = await fetch('/api/contratos/importar-completo', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ blobUrl: upData.url }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }

      if (!r.ok) {
        let mensagem = 'Erro ao analisar PDF'
        try {
          const data = await r.json()
          mensagem = data.erro || mensagem
          if (data.detalhe) mensagem += `\n\nDetalhe: ${data.detalhe}`
        } catch {
          mensagem = `Erro ${r.status} ao analisar PDF`
        }
        alert(mensagem)
        return
      }

      const data = await r.json()
      // Passa os dados do upload pra prévia, evitando reenvio
      setPreviaDados({
        ...data,
        file,
        uploadedBlob: upData,
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        alert('A análise demorou mais de 70 segundos e foi cancelada.\n\nPDFs escaneados (imagem) costumam demorar mais. Tente:\n• Converter o PDF pra texto com OCR antes\n• Cadastrar manualmente pelo botão "+ Novo manual"')
      } else {
        alert(`Falha de rede ao importar.\n\nDetalhe: ${err?.message || 'desconhecido'}`)
      }
    } finally {
      setImportando(false)
      if (inputImportRef.current) inputImportRef.current.value = ''
    }
  }
