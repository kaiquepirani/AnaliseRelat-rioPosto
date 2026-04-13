'use client'
import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'

interface Props {
  onUpload: (file: File) => void
  onUploadExcel?: (dados: any) => void
  processando: boolean
}

export default function Upload({ onUpload, processando }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [arrastando, setArrastando] = useState(false)

  const handleFile = (file: File) => {
    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf')
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
    if (!isPdf && !isExcel) return alert('Envie apenas arquivos PDF ou Excel (.xlsx).')
    onUpload(file)
  }

  return (
    <div
      className={`upload-area ${arrastando ? 'upload-arrastando' : ''} ${processando ? 'upload-processando' : ''}`}
      onDragOver={e => { e.preventDefault(); setArrastando(true) }}
      onDragLeave={() => setArrastando(false)}
      onDrop={e => { e.preventDefault(); setArrastando(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
      onClick={() => !processando && inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept=".pdf,.xlsx,.xls" hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      {processando ? (
        <span className="upload-texto">
          <span className="spinner" /> Processando extrato...
        </span>
      ) : (
        <span className="upload-texto">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Enviar extrato PDF ou Excel
        </span>
      )}
    </div>
  )
}
