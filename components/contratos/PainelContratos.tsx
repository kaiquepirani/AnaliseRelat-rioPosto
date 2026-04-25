const importarPDF = async (file: File) => {
    setImportando(true)
    try {
      const tamanhoMB = (file.size / 1024 / 1024).toFixed(2)
      if (file.size > 50 * 1024 * 1024) {
        alert(`Arquivo muito grande (${tamanhoMB} MB). O limite é 50 MB.`)
        return
      }

      // Compressão automática se o arquivo for maior que ~3.5 MB
      let arquivoFinal = file
      const LIMITE_VERCEL = 3.8 * 1024 * 1024

      if (file.size > LIMITE_VERCEL) {
        try {
          const { comprimirAteCaber, formatarTamanho } = await import('@/lib/comprimir-pdf')

          // Avisa que está comprimindo
          setImportando(true)
          // (visualmente o botão já mostra "Analisando PDF..." mas vamos colocar mais info via console)
          console.log(`PDF de ${formatarTamanho(file.size)} excede limite. Comprimindo...`)

          const resultado = await comprimirAteCaber(file)

          if (!resultado.cabeNoLimite) {
            alert(
              `Não foi possível comprimir o PDF o suficiente.\n\n` +
              `Original: ${formatarTamanho(resultado.tamanhoOriginal)}\n` +
              `Após compressão: ${formatarTamanho(resultado.tamanhoFinal)}\n` +
              `Limite: 4 MB\n\n` +
              `Sugestões:\n` +
              `• Use ilovepdf.com/pt/comprimir_pdf com "Compressão extrema"\n` +
              `• Cadastre manualmente pelo botão "+ Novo manual"`,
            )
            return
          }

          arquivoFinal = resultado.arquivoComprimido
          console.log(`Comprimido: ${formatarTamanho(resultado.tamanhoOriginal)} → ${formatarTamanho(resultado.tamanhoFinal)} (-${(resultado.reducao * 100).toFixed(0)}%)`)
        } catch (errComp: any) {
          alert(
            `Falha ao comprimir o PDF.\n\n` +
            `Detalhe: ${errComp?.message || 'erro desconhecido'}\n\n` +
            `Tente comprimir manualmente em ilovepdf.com antes de importar.`,
          )
          return
        }
      }

      // Upload para o Blob
      const fdUp = new FormData()
      fdUp.append('file', arquivoFinal)
      const rUp = await fetch('/api/contratos/upload', {
        method: 'POST', headers, body: fdUp,
      })
      if (!rUp.ok) {
        const dUp = await rUp.json().catch(() => ({}))
        alert(dUp.erro || `Falha ao enviar o PDF (status ${rUp.status})`)
        return
      }
      const upData = await rUp.json()

      // Chama a IA
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
      setPreviaDados({
        ...data,
        file: arquivoFinal,
        uploadedBlob: upData,
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
