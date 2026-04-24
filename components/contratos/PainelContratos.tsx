const importarPDF = async (file: File) => {
    setImportando(true)
    try {
      const tamanhoMB = (file.size / 1024 / 1024).toFixed(2)
      if (file.size > 25 * 1024 * 1024) {
        alert(`Arquivo muito grande (${tamanhoMB} MB). O limite é 25 MB.`)
        return
      }

      // 1. Upload direto do navegador pro Vercel Blob (sem passar pela Function)
      const { upload } = await import('@vercel/blob/client')
      let blobResult: { url: string; pathname: string }
      try {
        blobResult = await upload(`contratos/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`, file, {
          access: 'public',
          handleUploadUrl: '/api/contratos/upload-token',
          clientPayload: JSON.stringify({ token }),
        })
      } catch (err: any) {
        alert(`Falha ao enviar o PDF.\n\nDetalhe: ${err?.message || 'erro desconhecido'}`)
        return
      }

      // 2. Chama a IA passando só a URL do Blob
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 70000)

      let r: Response
      try {
        r = await fetch('/api/contratos/importar-completo', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ blobUrl: blobResult.url }),
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
      setPreviaDados({
        ...data,
        file,
        uploadedBlob: {
          url: blobResult.url,
          nome: file.name,
          tamanho: file.size,
        },
      })
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        alert('A análise demorou mais de 70 segundos e foi cancelada.\n\nTente:\n• Cadastrar manualmente pelo botão "+ Novo manual"')
      } else {
        alert(`Erro inesperado.\n\nDetalhe: ${err?.message || 'desconhecido'}`)
      }
    } finally {
      setImportando(false)
      if (inputImportRef.current) inputImportRef.current.value = ''
    }
  }
