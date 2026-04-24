'use client'
import { useState, useRef } from 'react'
import type { Contrato, TipoServicoContrato, StatusContrato, Aditamento } from '@/lib/contratos-types'
import { TIPOS_SERVICO } from '@/lib/contratos-types'
import { abrirContratoPDF } from '@/lib/contratos-download'

interface Props {
  contrato: Contrato | null
  token: string
  onCancelar: () => void
  onSalvar: (dados: Partial<Contrato>) => Promise<void>
  onAtualizarLista: () => Promise<void>
}

interface DadosIA {
  cliente: string | null
  numero: string | null
  cidade: string | null
  tipoServico: TipoServicoContrato | null
  dataInicio: string | null
  dataVencimento: string | null
  valorMensal: number | null
  valorTotal: number | null
  objeto: string | null
}

interface DadosAditamentoIA {
  data: string | null
  novaDataVencimento: string | null
  novoValorMensal: number | null
  novoValorTotal: number | null
  observacoes: string | null
}

const fmtReal = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (iso: string | undefined) => {
  if (!iso) return '—'
  const p = iso.split('-')
  if (p.length !== 3) return iso
  return `${p[2]}/${p[1]}/${p[0]}`
}

export default function FormularioContrato({ contrato, token, onCancelar, onSalvar, onAtualizarLista }: Props) {
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
  const [extraindo, setExtraindo] = useState(false)
  const [mensagemIA, setMensagemIA] = useState('')
  const [erroUpload, setErroUpload] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [camposIA, setCamposIA] = useState<Set<string>>(new Set())
  const [aditamentos, setAditamentos] = useState<Aditamento[]>(contrato?.aditamentos || [])
  const [adicionandoAditamento, setAdicionandoAditamento] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const marcarEdicaoManual = (nome: string) => {
    if (camposIA.has(nome)) {
      const novo = new Set(camposIA)
      novo.delete(nome)
      setCamposIA(novo)
    }
  }

  const aplicarDadosIA = (dados: DadosIA) => {
    const novos = new Set<string>()
    if (dados.cliente) { setCliente(dados.cliente); novos.add('cliente') }
    if (dados.numero) { setNumero(dados.numero); novos.add('numero') }
    if (dados.cidade) { setCidade(dados.cidade); novos.add('cidade') }
    if (dados.tipoServico) { setTipoServico(dados.tipoServico); novos.add('tipoServico') }
    if (dados.dataInicio) { setDataInicio(dados.dataInicio); novos.add('dataInicio') }
    if (dados.dataVencimento) { setDataVencimento(dados.dataVencimento); novos.add('dataVencimento') }
    if (dados.valorMensal != null) { setValorMensal(String(dados.valorMensal)); novos.add('valorMensal') }
    if (dados.valorTotal != null) { setValorTotal(String(dados.valorTotal)); novos.add('valorTotal') }
    if (dados.objeto) { setObjeto(dados.objeto); novos.add('objeto') }
    setCamposIA(novos)
  }

  const uploadArquivo = async (file: File) => {
    setErroUpload('')
    setMensagemIA('')
    setEnviandoArquivo(true)
    setExtraindo(true)

    const fdUp = new FormData(); fdUp.append('file', file)
    const fdEx = new FormData(); fdEx.append('file', file)
    const auth = { Authorization: `Bearer ${token}` }

    const pUp = fetch('/api/contratos/upload', { method: 'POST', headers: auth, body: fdUp })
    const pEx = fetch('/api/contratos/extrair', { method: 'POST', headers: auth, body: fdEx })

    try {
      const rUp = await pUp
      const dUp = await rUp.json()
      if (!rUp.ok) setErroUpload(dUp.erro || 'Erro no upload')
      else {
        setArquivoUrl(dUp.url); setArquivoNome(dUp.nome); setArquivoSize(dUp.tamanho)
      }
    } catch { setErroUpload('Falha na rede ao subir arquivo') }
    finally { setEnviandoArquivo(false) }

    try {
      const rEx = await pEx
      const dEx = await rEx.json()
      if (rEx.ok && dEx.dados) {
        aplicarDadosIA(dEx.dados)
        const preenchidos = Object.values(dEx.dados).filter(v => v != null).length
        setMensagemIA(preenchidos > 0
          ? `✨ ${preenchidos} ${preenchidos === 1 ? 'campo preenchido' : 'campos preenchidos'} automaticamente pela IA — revise antes de salvar.`
          : 'A IA analisou o PDF mas não identificou os dados. Preencha manualmente.'
        )
      }
    } catch { /* bônus, não bloqueia */ }
    finally { setExtraindo(false) }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cliente.trim() || !dataVencimento) {
      alert('Cliente e data de vencimento são obrigatórios')
      return
    }
    setSalvando(true)
    await onSalvar({
      numero: numero.trim(), cliente: cliente.trim(),
      tipoServico, cidade: cidade.trim(), dataInicio, dataVencimento,
      valorMensal: valorMensal ? Number(valorMensal.replace(',', '.')) : undefined,
      valorTotal: valorTotal ? Number(valorTotal.replace(',', '.')) : undefined,
      objeto: objeto.trim(), observacoes: observacoes.trim(), status,
      arquivoUrl: arquivoUrl || undefined,
      arquivoNome: arquivoNome || undefined,
      arquivoSize: arquivoSize || undefined,
    })
    setSalvando(false)
  }

  const removerArquivo = () => {
    setArquivoUrl(''); setArquivoNome(''); setArquivoSize(0); setMensagemIA('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const visualizarArquivo = () => {
    if (contrato?.id) abrirContratoPDF(contrato.id, arquivoNome, token)
    else alert('Salve o contrato primeiro para visualizar o arquivo.')
  }

  const encerrarContrato = async () => {
    if (!contrato?.id) return
    if (!confirm(`Encerrar o contrato de "${cliente}"? Ele sairá da lista principal e irá para o filtro "Encerrados".`)) return
    const r = await fetch(`/api/contratos/${contrato.id}/encerrar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) { alert('Erro ao encerrar'); return }
    await onAtualizarLista()
    onCancelar()
  }

  const excluirAditamento = async (ad: Aditamento) => {
    if (!contrato?.id) return
    if (!confirm('Excluir este aditamento? Esta ação não pode ser desfeita.')) return
    const r = await fetch(`/api/contratos/${contrato.id}/aditamentos/${ad.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) { alert('Erro ao excluir aditamento'); return }
    setAditamentos(aditamentos.filter(a => a.id !== ad.id))
    await onAtualizarLista()
  }

  const aditamentoAdicionado = (novo: Aditamento, contratoAtualizado?: Contrato) => {
    setAditamentos([...aditamentos, novo].sort((a, b) => a.data.localeCompare(b.data)))
    if (contratoAtualizado) {
      if (contratoAtualizado.dataVencimento !== dataVencimento) setDataVencimento(contratoAtualizado.dataVencimento)
      if (contratoAtualizado.valorMensal != null && String(contratoAtualizado.valorMensal) !== valorMensal) {
        setValorMensal(String(contratoAtualizado.valorMensal))
      }
      if (contratoAtualizado.valorTotal != null && String(contratoAtualizado.valorTotal) !== valorTotal) {
        setValorTotal(String(contratoAtualizado.valorTotal))
      }
    }
    setAdicionandoAditamento(false)
    onAtualizarLista()
  }

  const jaEncerrado = status === 'encerrado'

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, overflowY: 'auto',
    }}>
      <form onSubmit={submit} style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 680,
        maxHeight: '92vh', overflowY: 'auto', fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid #e5e7eb',
          position: 'sticky', top: 0, background: '#fff', zIndex: 1,
        }}>
          <h2 style={{ margin: 0, fontSize: 18, color: '#2D3A6B' }}>
            {contrato ? 'Editar contrato' : 'Novo contrato'}
          </h2>
          {contrato?.dataEncerramento && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              Encerrado em {fmtData(contrato.dataEncerramento)}
            </div>
          )}
        </div>

        <div style={{ padding: 22, display: 'grid', gap: 14 }}>

          {extraindo && (
            <div style={{
              padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe',
              borderRadius: 8, color: '#1d4ed8', fontSize: 13,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{
                width: 14, height: 14, border: '2px solid #bfdbfe',
                borderTopColor: '#1d4ed8', borderRadius: '50%',
                animation: 'girar 0.8s linear infinite', display: 'inline-block',
              }} />
              Analisando contrato com IA...
              <style>{`@keyframes girar { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {mensagemIA && !extraindo && (
            <div style={{
              padding: '10px 14px', background: '#fef3c7', border: '1px solid #fde68a',
              borderRadius: 8, color: '#92400e', fontSize: 13,
            }}>{mensagemIA}</div>
          )}

          <Campo label="Cliente *" comIA={camposIA.has('cliente')}>
            <input value={cliente}
              onChange={e => { setCliente(e.target.value); marcarEdicaoManual('cliente') }}
              style={inputStyle} required />
          </Campo>

          <div style={grid2}>
            <Campo label="Número do contrato" comIA={camposIA.has('numero')}>
              <input value={numero}
                onChange={e => { setNumero(e.target.value); marcarEdicaoManual('numero') }}
                style={inputStyle} />
            </Campo>
            <Campo label="Cidade" comIA={camposIA.has('cidade')}>
              <input value={cidade}
                onChange={e => { setCidade(e.target.value); marcarEdicaoManual('cidade') }}
                style={inputStyle} placeholder="Ex.: Itapira" />
            </Campo>
          </div>

          <div style={grid2}>
            <Campo label="Tipo de serviço" comIA={camposIA.has('tipoServico')}>
              <select value={tipoServico}
                onChange={e => { setTipoServico(e.target.value as TipoServicoContrato); marcarEdicaoManual('tipoServico') }}
                style={inputStyle}>
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
            <Campo label="Data de início" comIA={camposIA.has('dataInicio')}>
              <input type="date" value={dataInicio}
                onChange={e => { setDataInicio(e.target.value); marcarEdicaoManual('dataInicio') }}
                style={inputStyle} />
            </Campo>
            <Campo label="Data de vencimento *" comIA={camposIA.has('dataVencimento')}>
              <input type="date" value={dataVencimento}
                onChange={e => { setDataVencimento(e.target.value); marcarEdicaoManual('dataVencimento') }}
                style={inputStyle} required />
            </Campo>
          </div>

          <div style={grid2}>
            <Campo label="Valor mensal (R$)" comIA={camposIA.has('valorMensal')}>
              <input value={valorMensal}
                onChange={e => { setValorMensal(e.target.value); marcarEdicaoManual('valorMensal') }}
                style={inputStyle} placeholder="45000.00" />
            </Campo>
            <Campo label="Valor total (R$)" comIA={camposIA.has('valorTotal')}>
              <input value={valorTotal}
                onChange={e => { setValorTotal(e.target.value); marcarEdicaoManual('valorTotal') }}
                style={inputStyle} placeholder="540000.00" />
            </Campo>
          </div>

          <Campo label="Objeto do contrato" comIA={camposIA.has('objeto')}>
            <textarea value={objeto}
              onChange={e => { setObjeto(e.target.value); marcarEdicaoManual('objeto') }}
              style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
          </Campo>

          <Campo label="Observações">
            <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
              style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
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
                    <div style={{ fontSize: 11, color: '#0369a1' }}>{(arquivoSize / 1024 / 1024).toFixed(2)} MB</div>
                  )}
                </div>
                <button type="button" onClick={visualizarArquivo} style={linkStyle}>Ver</button>
                <button type="button" onClick={removerArquivo} style={linkDangerStyle}>Remover</button>
              </div>
            ) : (
              <>
                <input ref={fileRef} type="file" accept="application/pdf,.pdf"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadArquivo(f) }}
                  disabled={enviandoArquivo || extraindo}
                  style={{ fontSize: 13, fontFamily: 'inherit' }} />
                {enviandoArquivo && <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>Enviando arquivo...</div>}
              </>
            )}
            {erroUpload && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>{erroUpload}</div>}
          </Campo>

          {contrato?.id && (
            <div style={{
              marginTop: 8, paddingTop: 18, borderTop: '1px solid #e5e7eb',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#2D3A6B' }}>
                    Histórico de aditamentos
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {aditamentos.length === 0
                      ? 'Nenhum termo de aditamento registrado.'
                      : `${aditamentos.length} ${aditamentos.length === 1 ? 'aditamento registrado' : 'aditamentos registrados'}.`}
                  </div>
                </div>
                {!adicionandoAditamento && !jaEncerrado && (
                  <button type="button" onClick={() => setAdicionandoAditamento(true)} style={{
                    padding: '8px 14px', background: '#10b981', color: '#fff',
                    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>+ Novo aditamento</button>
                )}
              </div>

              {aditamentos.length > 0 && (
                <div style={{ display: 'grid', gap: 8 }}>
                  {aditamentos.map(ad => (
                    <div key={ad.id} style={{
                      padding: 12, background: '#f8fafc', border: '1px solid #e2e8f0',
                      borderRadius: 8, display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap',
                    }}>
                      <div style={{ fontSize: 20 }}>📎</div>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                          Aditamento de {fmtData(ad.data)}
                        </div>
                        <div style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>
                          {ad.novaDataVencimento && <>Novo vencimento: <strong>{fmtData(ad.novaDataVencimento)}</strong><br /></>}
                          {ad.novoValorMensal != null && <>Novo valor mensal: <strong>{fmtReal(ad.novoValorMensal)}</strong><br /></>}
                          {ad.novoValorTotal != null && <>Novo valor total: <strong>{fmtReal(ad.novoValorTotal)}</strong><br /></>}
                          {ad.observacoes && <span style={{ color: '#64748b' }}>{ad.observacoes}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <a href={ad.arquivoUrl} target="_blank" rel="noreferrer"
                          onClick={e => { e.preventDefault(); abrirAditamentoPDF(contrato.id, ad, token) }}
                          style={linkStyle}>Ver</a>
                        <button type="button" onClick={() => excluirAditamento(ad)} style={linkDangerStyle}>Excluir</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {adicionandoAditamento && (
                <NovoAditamento
                  contratoId={contrato.id}
                  token={token}
                  onCancelar={() => setAdicionandoAditamento(false)}
                  onAdicionado={aditamentoAdicionado}
                />
              )}
            </div>
          )}

          {contrato?.id && !jaEncerrado && (
            <div style={{
              marginTop: 4, padding: 14, background: '#fef2f2',
              border: '1px solid #fecaca', borderRadius: 8,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>
                Encerrar contrato
              </div>
              <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 10 }}>
                Marca como encerrado e remove da lista principal. Continua acessível pelo filtro "Encerrados".
              </div>
              <button type="button" onClick={encerrarContrato} style={{
                padding: '8px 14px', background: '#dc2626', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>🔒 Encerrar este contrato</button>
            </div>
          )}

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
          <button type="submit" disabled={salvando || enviandoArquivo || extraindo} style={{
            padding: '10px 20px',
            background: salvando || enviandoArquivo || extraindo ? '#94a3b8' : '#2D3A6B',
            color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: salvando || enviandoArquivo || extraindo ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}

const abrirAditamentoPDF = async (contratoId: string, ad: Aditamento, token: string) => {
  try {
    const r = await fetch(`/api/contratos/${contratoId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) {
      window.open(ad.arquivoUrl, '_blank')
      return
    }
    // Se o contrato principal tem download autenticado, o PDF do aditamento usa a URL privada
    // diretamente via uma rota dedicada seria melhor, mas por simplicidade abrimos em aba nova com token via fetch
    await abrirPDFUrl(ad.arquivoUrl, ad.arquivoNome, token)
  } catch {
    window.open(ad.arquivoUrl, '_blank')
  }
}

const abrirPDFUrl = async (_url: string, arquivoNome: string, _token: string) => {
  // Fallback: se não houver rota autenticada específica, abre numa nova aba
  alert('Para visualizar o PDF do aditamento, será adicionada uma rota de download específica. Por enquanto, o arquivo está salvo no armazenamento privado. — ' + arquivoNome)
}

interface NovoAditamentoProps {
  contratoId: string
  token: string
  onCancelar: () => void
  onAdicionado: (ad: Aditamento, contratoAtualizado?: Contrato) => void
}

function NovoAditamento({ contratoId, token, onCancelar, onAdicionado }: NovoAditamentoProps) {
  const [data, setData] = useState('')
  const [novaDataVencimento, setNovaDataVencimento] = useState('')
  const [novoValorMensal, setNovoValorMensal] = useState('')
  const [novoValorTotal, setNovoValorTotal] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [arquivoUrl, setArquivoUrl] = useState('')
  const [arquivoNome, setArquivoNome] = useState('')
  const [arquivoSize, setArquivoSize] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [extraindo, setExtraindo] = useState(false)
  const [mensagemIA, setMensagemIA] = useState('')
  const [erro, setErro] = useState('')
  const [aplicarVencimento, setAplicarVencimento] = useState(true)
  const [aplicarValorMensal, setAplicarValorMensal] = useState(true)
  const [aplicarValorTotal, setAplicarValorTotal] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const aplicarDadosIA = (d: DadosAditamentoIA) => {
    if (d.data) setData(d.data)
    if (d.novaDataVencimento) setNovaDataVencimento(d.novaDataVencimento)
    if (d.novoValorMensal != null) setNovoValorMensal(String(d.novoValorMensal))
    if (d.novoValorTotal != null) setNovoValorTotal(String(d.novoValorTotal))
    if (d.observacoes) setObservacoes(d.observacoes)
  }

  const uploadEExtrair = async (file: File) => {
    setErro(''); setMensagemIA('')
    setEnviando(true); setExtraindo(true)

    const fdUp = new FormData(); fdUp.append('file', file)
    const fdEx = new FormData(); fdEx.append('file', file)
    const auth = { Authorization: `Bearer ${token}` }

    const pUp = fetch('/api/contratos/upload', { method: 'POST', headers: auth, body: fdUp })
    const pEx = fetch('/api/contratos/extrair-aditamento', { method: 'POST', headers: auth, body: fdEx })

    try {
      const rUp = await pUp
      const dUp = await rUp.json()
      if (!rUp.ok) setErro(dUp.erro || 'Erro no upload')
      else {
        setArquivoUrl(dUp.url); setArquivoNome(dUp.nome); setArquivoSize(dUp.tamanho)
      }
    } catch { setErro('Falha na rede') }
    finally { setEnviando(false) }

    try {
      const rEx = await pEx
      const dEx = await rEx.json()
      if (rEx.ok && dEx.dados) {
        aplicarDadosIA(dEx.dados)
        const n = Object.values(dEx.dados).filter(v => v != null).length
        if (n > 0) setMensagemIA(`✨ IA identificou ${n} ${n === 1 ? 'campo' : 'campos'} — revise.`)
      }
    } catch { /* bônus */ }
    finally { setExtraindo(false) }
  }

  const salvar = async () => {
    if (!arquivoUrl) { alert('Anexe o PDF do aditamento'); return }
    if (!data) { alert('Informe a data do aditamento'); return }
    setSalvando(true)
    try {
      const r = await fetch(`/api/contratos/${contratoId}/aditamentos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data,
          novaDataVencimento: novaDataVencimento || undefined,
          novoValorMensal: novoValorMensal ? Number(novoValorMensal.replace(',', '.')) : undefined,
          novoValorTotal: novoValorTotal ? Number(novoValorTotal.replace(',', '.')) : undefined,
          observacoes: observacoes.trim() || undefined,
          arquivoUrl, arquivoNome, arquivoSize,
          aplicarVencimento: aplicarVencimento && !!novaDataVencimento,
          aplicarValorMensal: aplicarValorMensal && !!novoValorMensal,
          aplicarValorTotal: aplicarValorTotal && !!novoValorTotal,
        }),
      })
      const dados = await r.json()
      if (!r.ok) { alert(dados.erro || 'Erro ao salvar aditamento'); return }
      onAdicionado(dados.aditamento, dados.contrato)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={{
      padding: 14, background: '#f0fdf4', border: '1px solid #bbf7d0',
      borderRadius: 8, display: 'grid', gap: 12,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>Novo termo de aditamento</div>

      {!arquivoUrl ? (
        <div>
          <input type="file" accept="application/pdf,.pdf"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadEExtrair(f) }}
            disabled={enviando || extraindo}
            style={{ fontSize: 13, fontFamily: 'inherit' }} />
          {enviando && <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>Enviando...</div>}
          {extraindo && (
            <div style={{ fontSize: 12, color: '#1d4ed8', marginTop: 6 }}>
              🔍 Analisando aditamento com IA...
            </div>
          )}
          {erro && <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>{erro}</div>}
        </div>
      ) : (
        <div style={{
          padding: 10, background: '#fff', border: '1px solid #bbf7d0', borderRadius: 6,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 16 }}>📎</span>
          <div style={{ flex: 1, fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: '#166534' }}>{arquivoNome}</div>
            {arquivoSize > 0 && <div style={{ color: '#64748b' }}>{(arquivoSize / 1024 / 1024).toFixed(2)} MB</div>}
          </div>
          <button type="button" onClick={() => {
            setArquivoUrl(''); setArquivoNome(''); setArquivoSize(0); setMensagemIA('')
          }} style={linkDangerStyle}>Trocar</button>
        </div>
      )}

      {mensagemIA && (
        <div style={{ fontSize: 12, color: '#b45309', background: '#fef3c7', padding: 8, borderRadius: 6 }}>
          {mensagemIA}
        </div>
      )}

      <div style={grid2}>
        <Campo label="Data do aditamento *">
          <input type="date" value={data} onChange={e => setData(e.target.value)} style={inputStyle} />
        </Campo>
        <Campo label="Nova data de vencimento">
          <input type="date" value={novaDataVencimento} onChange={e => setNovaDataVencimento(e.target.value)} style={inputStyle} />
        </Campo>
      </div>

      <div style={grid2}>
        <Campo label="Novo valor mensal (R$)">
          <input value={novoValorMensal} onChange={e => setNovoValorMensal(e.target.value)}
            style={inputStyle} placeholder="48000.00" />
        </Campo>
        <Campo label="Novo valor total (R$)">
          <input value={novoValorTotal} onChange={e => setNovoValorTotal(e.target.value)}
            style={inputStyle} placeholder="576000.00" />
        </Campo>
      </div>

      <Campo label="Observações (o que mudou)">
        <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
          style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} />
      </Campo>

      {(novaDataVencimento || novoValorMensal || novoValorTotal) && (
        <div style={{
          padding: 10, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6,
          display: 'grid', gap: 4,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
            Aplicar ao contrato principal:
          </div>
          {novaDataVencimento && (
            <label style={checkboxStyle}>
              <input type="checkbox" checked={aplicarVencimento} onChange={e => setAplicarVencimento(e.target.checked)} />
              Atualizar data de vencimento para <strong>{fmtData(novaDataVencimento)}</strong>
            </label>
          )}
          {novoValorMensal && (
            <label style={checkboxStyle}>
              <input type="checkbox" checked={aplicarValorMensal} onChange={e => setAplicarValorMensal(e.target.checked)} />
              Atualizar valor mensal para <strong>{fmtReal(Number(novoValorMensal.replace(',', '.')))}</strong>
            </label>
          )}
          {novoValorTotal && (
            <label style={checkboxStyle}>
              <input type="checkbox" checked={aplicarValorTotal} onChange={e => setAplicarValorTotal(e.target.checked)} />
              Atualizar valor total para <strong>{fmtReal(Number(novoValorTotal.replace(',', '.')))}</strong>
            </label>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancelar} style={{
          padding: '8px 14px', background: '#fff', color: '#64748b',
          border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
        }}>Cancelar</button>
        <button type="button" onClick={salvar} disabled={salvando || enviando || extraindo || !arquivoUrl || !data} style={{
          padding: '8px 14px',
          background: salvando || enviando || extraindo || !arquivoUrl || !data ? '#94a3b8' : '#10b981',
          color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600,
          cursor: salvando || enviando || extraindo || !arquivoUrl || !data ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
        }}>{salvando ? 'Salvando...' : 'Salvar aditamento'}</button>
      </div>
    </div>
  )
}

const Campo = ({ label, children, comIA }: { label: string; children: React.ReactNode; comIA?: boolean }) => (
  <label style={{ display: 'block' }}>
    <div style={{
      fontSize: 12, color: '#374151', fontWeight: 600, marginBottom: 6,
      display: 'flex', gap: 6, alignItems: 'center',
    }}>
      {label}
      {comIA && (
        <span style={{
          fontSize: 10, fontWeight: 700, color: '#b45309',
          background: '#fef3c7', border: '1px solid #fde68a',
          padding: '1px 6px', borderRadius: 4, letterSpacing: 0.3,
        }}>✨ IA</span>
      )}
    </div>
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

const linkStyle: React.CSSProperties = {
  fontSize: 12, color: '#0369a1', fontWeight: 600,
  background: 'transparent', border: 'none', cursor: 'pointer',
  fontFamily: 'inherit', padding: 0, textDecoration: 'underline',
}

const linkDangerStyle: React.CSSProperties = {
  fontSize: 12, color: '#b91c1c', fontWeight: 600,
  background: 'transparent', border: 'none', cursor: 'pointer',
  fontFamily: 'inherit', padding: 0,
}

const checkboxStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: 12, color: '#374151', cursor: 'pointer',
}
