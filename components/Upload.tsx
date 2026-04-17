'use client'
import { useRef, useState } from 'react'

interface Props {
  onUpload: (file: File) => void
  onUploadExcel?: (dados: any) => void
  processando: boolean
  progresso?: { atual: number; total: number; nomeArquivo: string }
}

export default function Upload({ onUpload, processando, progresso }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [arrastando, setArrastando] = useState(false)

  const handleFiles = (files: FileList) => {
    const validos = Array.from(files).filter(f => {
      const isPdf = f.type === 'application/pdf' || f.name.endsWith('.pdf')
      const isExcel = f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
      return isPdf || isExcel
    })
    if (validos.length === 0) return alert('Envie apenas arquivos PDF ou Excel (.xlsx).')
    if (validos.length < files.length) alert(`${files.length - validos.length} arquivo(s) ignorado(s) — formato não suportado.`)
    validos.forEach(f => onUpload(f))
  }

  return (
    <div
      className={`upload-area ${arrastando ? 'upload-arrastando' : ''} ${processando ? 'upload-processando' : ''}`}
      onDragOver={e => { e.preventDefault(); setArrastando(true) }}
      onDragLeave={() => setArrastando(false)}
      onDrop={e => { e.preventDefault(); setArrastando(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files) }}
      onClick={() => !processando && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.xlsx,.xls"
        multiple
        hidden
        onChange={e => { if (e.target.files?.length) { handleFiles(e.target.files); e.target.value = '' } }}
      />
      {processando && progresso ? (
        <span className="upload-texto">
          <span className="spinner" />
          {progresso.total > 1
            ? `Processando ${progresso.atual}/${progresso.total} — ${progresso.nomeArquivo}`
            : `Processando ${progresso.nomeArquivo}...`}
        </span>
      ) : processando ? (
        <span className="upload-texto">
          <span className="spinner" /> Processando extrato...
        </span>
      ) : (
        <span className="upload-texto">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Enviar extrato PDF ou Excel
        </span>
      )}
    </div>
  )
}
