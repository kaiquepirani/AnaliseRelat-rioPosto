'use client'
import { useState, useRef } from 'react'
import type { Contrato, TipoServicoContrato, StatusContrato } from '@/lib/contratos-types'
import { TIPOS_SERVICO } from '@/lib/contratos-types'
import { abrirContratoPDF } from '@/lib/contratos-download'

interface Props {
  contrato: Contrato | null
  token: string
  onCancelar: () => void
  onSalvar: (dados: Partial<Contrato>) => Promise<void>
}

export default function FormularioContrato({ contrato, token, onCancelar, onSalvar }: Props) {
  const [numero, setNumero] = useState(contrato?.numero || '')
  const [cliente, setCliente] = useState(contrato?.cliente || '')
  const [tipoServico, setTipoServico] = useState<TipoServicoContrato>(contrato?.tipoServico || 'Transporte Escolar')
  const [cidade, setCidade] = useState(contrato?.cidade || '')
  const [dataInicio, setDataInicio] = useState(contrato?.dataInicio || '')
  const [dataVencimento, setDataVencimento] = useState(contrato?.dataVencimento || '')
  const [valorMensal, setValorMensal] = useState(contrato?.valorMensal != null ? String(contrato.valorMensal) : '')
  const [valorTotal, setValorTotal] = useState(contrato?.valorTotal != null ? String(contrato.valorTotal) : '')
  const [objeto, setObjeto] = useState(contrato?.objeto || '')
  const [observacoes, setObservacoes] = useState(contrato?.observacoes || '')
  const [status, setStatus] = useState<StatusContrato>(contrato?.status || 'vigente')
  const [arquivoUrl, setArquivoUrl] = useState(contrato?.arquivoUrl || '')
  const [arquivoNome, setArquivoNome] = useState(contrato?.arquivoNome || '')
  const [arquivoSize, setArquivoSize] = useState(contrato?.arquivoSize || 0)
  const [enviandoArquivo, setEnviandoArquivo] = useState(false)
  const [erroUpload, setErroUpload] = useState('')
  const [salvando, setSalvando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const uploadArquivo = async (file: File) => {
    setErroUpload('')
    setEnviandoArquivo(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/contratos/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      const data = await r.json()
      if (!r.ok) { setErroUpload(data.erro || 'Erro no upload'); return }
      setArquivoUrl(data.url)
      setArquivoNome(data.nome)
      setArquivoSize(data.tamanho)
    } catch {
      setErroUpload('Falha na rede')
    } finally {
      setEnviandoArquivo(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cliente.trim() || !dataVencimento) {
      alert('Cliente e data de vencimento são obrigatórios')
      return
    }
    setSalvando(true)
    await onSalvar({
      numero: numero.trim(),
      cliente: cliente.trim(),
      tipoServico, cidade: cidade.trim(),
      dataInicio, dataVencimento,
      valorMensal: valorMensal ? Number(valorMensal.replace(',', '.')) : undefined,
      valorTotal: valorTotal ? Number(valorTotal.replace(',', '.')) : undefined,
      objeto: objeto.trim(), observacoes: observacoes.trim(),
      status,
      arquivoUrl: arquivoUrl || undefined,
      arquivoNome: arquivoNome || undefined,
      arquivoSize: arquivoSize || undefined,
    })
    setSalvando(false)
  }

  const removerArquivo = () => {
    setArquivoUrl(''); setArquivoNome(''); setArquivoSize(0)
    if (fileRef.current) fileRef.current.value = ''
  }

  const visualizarArquivo = () => {
    if (contrato?.id) {
      abrirContratoPDF(contrato.id, arquivoNome, token)
    } else {
      alert('Salve o contrato primeiro para visualizar o arquivo.')
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, overflowY: 'auto',
    }}>
      <form onSubmit={submit} style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 640,
        maxHeight: '90vh', overflowY: 'auto', fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid #e5e7eb',
          position: 'sticky', top: 0, background: '#fff', zIndex: 1,
        }}>
          <h2 style={{ margin: 0, fontSize: 18, color: '#2D3A6B' }}>
            {contrato ? 'Editar contrato' : 'Novo contrato'}
          </h2>
        </div>

        <div style={{ padding: 22, display: 'grid', gap: 14 }}>
          <Campo label="Cliente *">
            <input value={cliente} onChange={e => setCliente(e.target.value)} style={inputStyle} required />
          </Campo>

          <div style={grid2}>
            <Campo label="Número do contrato">
              <input value={numero} onChange={e => setNumero(e.target.value)} style={inputStyle} />
            </Campo>
            <Campo label="Cidade">
              <input value={cidade} onChange={e => setCidade(e.target.value)} style={inputStyle} placeholder="Ex.: Itapira" />
            </Campo>
          </div>

          <div style={grid2}>
            <Campo label="Tipo de serviço">
              <select value={tipoServico} onChange={e => setTipoServico(e.target.value as TipoServicoContrato)} style={inputStyle}>
                {TIPOS_SERVICO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Campo>
            <Campo label="Situação">
              <select value={status} onChange={e => setStatus(e.target.value as StatusContrato)} style={inputStyle}>
                <option value="vigente">Vigente</option>
                <option value="em_renovacao">Em renovação</option>
                <option value="encerrado">Encerrado</option>
              </select>
            </Campo>
          </div>

          <div style={grid2}>
            <Campo label="Data de início">
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={inputStyle} />
            </Campo>
            <Campo label="Data de vencimento *">
              <input type="date" value={dataVencimento} onChange={e => setDataVencimento(e.target.value)} style={inputStyle} required />
            </Campo>
          </div>

          <div style={grid2}>
            <Campo label="Valor mensal (R$)">
              <input value={valorMensal} onChange={e => setValorMensal(e.target.value)} style={inputStyle} placeholder="45000.00" />
            </Campo>
            <Campo label="Valor total (R$)">
              <input value={valorTotal} onChange={e => setValorTotal(e.target.value)} style={inputStyle} placeholder="540000.00" />
            </Campo>
          </div>

          <Campo label="Objeto do contrato">
            <textarea value={objeto} onChange={e => setObjeto(e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
          </Campo>

          <Campo label="Observações">
            <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
          </Campo>

          <Campo label="Arquivo do contrato (PDF, até 10 MB)">
            {arquivoUrl ? (
              <div style={{
                padding: 12, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8,
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: 20 }}>📄</span>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0c4a6e' }}>{arquivoNome || 'contrato.pdf'}</div>
                  {arquivoSize > 0 && (
                    <div style={{ fontSize: 11, color: '#0369a1' }}>
                      {(arquivoSize / 1024 / 1024).toFixed(2)} MB
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={visualizarArquivo}
                  style={{
                    fontSize: 12, color: '#0369a1', fontWeight: 600,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', padding: 0, textDecoration: 'underline',
                  }}
                >
                  Ver
                </button>
                <button type="button" onClick={removerArquivo} style={{
                  background: 'transparent', border: 'none', color: '#b91c1c',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>Remover</button>
              </div>
            ) : (
              <>
                <input
                  ref={fileRef} type="file" accept="application/pdf,.pdf"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) uploadArquivo(f)
                  }}
                  disabled={enviandoArquivo}
                  style={{ fontSize: 13, fontFamily: 'inherit' }}
                />
                {enviandoArquivo && (
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>Enviando arquivo...</div>
                )}
              </>
            )}
            {erroUpload && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>{erroUpload}</div>}
          </Campo>
        </div>

        <div style={{
          padding: '14px 22px', borderTop: '1px solid #e5e7eb',
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          position: 'sticky', bottom: 0, background: '#fff',
        }}>
          <button type="button" onClick={onCancelar} style={{
            padding: '10px 18px', background: '#fff', color: '#64748b',
            border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancelar</button>
          <button type="submit" disabled={salvando || enviandoArquivo} style={{
            padding: '10px 20px',
            background: salvando || enviandoArquivo ? '#94a3b8' : '#2D3A6B',
            color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: salvando || enviandoArquivo ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}

const Campo = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: 'block' }}>
    <div style={{ fontSize: 12, color: '#374151', fontWeight: 600, marginBottom: 6 }}>{label}</div>
    {children}
  </label>
)

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb',
  borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box', background: '#fff',
}

const grid2: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12,
}
