'use client'
import { useState, useRef } from 'react'
import type {
  Contrato, TipoServicoContrato, StatusContrato, Aditamento,
  ItemContrato, TipoAditamento,
} from '@/lib/contratos-types'
import {
  TIPOS_SERVICO, rotuloTipoAditamento, corTipoAditamento,
  itensVigentes, somarValoresItens, aplicarReajustePercentual,
} from '@/lib/contratos-types'
import { abrirContratoPDF } from '@/lib/contratos-download'

interface Props {
  contrato: Contrato | null
  token: string
  onCancelar: () => void
  onSalvar: (dados: Partial<Contrato>) => Promise<void>
  onAtualizarLista: () => Promise<void>
}

const fmtReal = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtReal4 = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })
const fmtNum = (n: number) => n.toLocaleString('pt-BR')

const fmtData = (iso: string | undefined) => {
  if (!iso) return '—'
  const p = iso.split('-')
  if (p.length !== 3) return iso
  return `${p[2]}/${p[1]}/${p[0]}`
}

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random()

export default function FormularioContrato({ contrato, token, onCancelar, onSalvar, onAtualizarLista }: Props) {
  const [numero, setNumero] = useState(contrato?.numero || '')
  const [cliente, setCliente] = useState(contrato?.cliente || '')
  const [contratante, setContratante] = useState(contrato?.contratante || '')
  const [cnpjContratante, setCnpjContratante] = useState(contrato?.cnpjContratante || '')
  const [processoAdministrativo, setProcessoAdministrativo] = useState(contrato?.processoAdministrativo || '')
  const [modalidadeLicitacao, setModalidadeLicitacao] = useState(contrato?.modalidadeLicitacao || '')
  const [tipoServico, setTipoServico] = useState<TipoServicoContrato>(contrato?.tipoServico || 'Transporte Escolar')
  const [cidade, setCidade] = useState(contrato?.cidade || '')
  const [dataInicio, setDataInicio] = useState(contrato?.dataInicio || '')
  const [dataVencimento, setDataVencimento] = useState(contrato?.dataVencimento || '')
  const [valorTotal, setValorTotal] = useState(contrato?.valorTotal != null ? String(contrato.valorTotal) : '')
  const [objeto, setObjeto] = useState(contrato?.objeto || '')
  const [observacoes, setObservacoes] = useState(contrato?.observacoes || '')
  const [clausulaReajuste, setClausulaReajuste] = useState(contrato?.clausulaReajuste || '')
  const [status, setStatus] = useState<StatusContrato>(contrato?.status || 'vigente')
  const [itensState, setItensState] = useState<ItemContrato[]>(contrato?.itens || [])
  const [aditamentos, setAditamentos] = useState<Aditamento[]>(contrato?.aditamentos || [])
  const [adicionandoAditamento, setAdicionandoAditamento] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [aditExpandidos, setAditExpandidos] = useState<Set<string>>(new Set())

  const arquivoUrl = contrato?.arquivoUrl || ''
  const arquivoNome = contrato?.arquivoNome || ''
  const arquivoSize = contrato?.arquivoSize || 0

  const itensAtuais = aditamentos.length > 0
    ? (() => {
        for (let i = aditamentos.length - 1; i >= 0; i--) {
          const ad = aditamentos[i]
          if (ad.itensResultantes && ad.itensResultantes.length > 0) return ad.itensResultantes
        }
        return itensState
      })()
    : itensState

  const toggleExpandirAd = (id: string) => {
    const n = new Set(aditExpandidos)
    if (n.has(id)) n.delete(id); else n.add(id)
    setAditExpandidos(n)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cliente.trim() && !contratante.trim()) {
      alert('Informe o contratante')
      return
    }
    if (!dataVencimento) {
      alert('Informe a data de vencimento')
      return
    }
    setSalvando(true)
    await onSalvar({
      numero: numero.trim(),
      cliente: cliente.trim() || contratante.trim(),
      contratante: contratante.trim() || undefined,
      cnpjContratante: cnpjContratante.trim() || undefined,
      processoAdministrativo: processoAdministrativo.trim() || undefined,
      modalidadeLicitacao: modalidadeLicitacao.trim() || undefined,
      tipoServico, cidade: cidade.trim(), dataInicio, dataVencimento,
      valorTotal: valorTotal ? Number(valorTotal.replace(',', '.')) : undefined,
      objeto: objeto.trim(), observacoes: observacoes.trim(),
      clausulaReajuste: clausulaReajuste.trim() || undefined,
      status,
      itens: itensState,
      aditamentos,
    })
    setSalvando(false)
  }

  const visualizarArquivo = () => {
    if (contrato?.id && arquivoUrl) abrirContratoPDF(contrato.id, arquivoNome, token)
    else alert('Nenhum PDF associado a este contrato.')
  }

  const encerrarContrato = async () => {
    if (!contrato?.id) return
    if (!confirm(`Encerrar o contrato de "${cliente || contratante}"? Ele sairá da lista principal e irá para o filtro "Encerrados".`)) return
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
    if (!confirm(`Excluir o ${ad.numero}º Termo Aditivo? Esta ação não pode ser desfeita.`)) return
    const r = await fetch(`/api/contratos/${contrato.id}/aditamentos/${ad.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!r.ok) { alert('Erro ao excluir aditamento'); return }
    setAditamentos(aditamentos.filter(a => a.id !== ad.id))
    await onAtualizarLista()
  }

  const aditamentoAdicionado = (novo: Aditamento, contratoAtualizado?: Contrato) => {
    if (contratoAtualizado) {
      setAditamentos(contratoAtualizado.aditamentos || [])
      if (contratoAtualizado.dataVencimento) setDataVencimento(contratoAtualizado.dataVencimento)
      if (contratoAtualizado.valorTotal != null) setValorTotal(String(contratoAtualizado.valorTotal))
    } else {
      setAditamentos([...aditamentos, novo].sort((a, b) => a.data.localeCompare(b.data)))
    }
    setAdicionandoAditamento(false)
    onAtualizarLista()
  }

  const jaEncerrado = status === 'encerrado'
  const totalItens = somarValoresItens(itensAtuais)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, overflowY: 'auto',
    }}>
      <form onSubmit={submit} style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 780,
        maxHeight: '92vh', overflowY: 'auto', fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid #e5e7eb',
          position: 'sticky', top: 0, background: '#fff', zIndex: 1,
        }}>
          <h2 style={{ margin: 0, fontSize: 18, color: '#2D3A6B' }}>
            {contrato ? 'Editar contrato' : 'Novo contrato manual'}
          </h2>
          {contrato?.dataEncerramento && (
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              Encerrado em {fmtData(contrato.dataEncerramento)}
            </div>
          )}
        </div>

        <div style={{ padding: 22, display: 'grid', gap: 14 }}>

          <Campo label="Contratante *">
            <input value={contratante} onChange={e => setContratante(e.target.value)} style={inputStyle}
              placeholder="Ex.: Prefeitura Municipal de Aguaí" />
          </Campo>

          <div style={grid2}>
            <Campo label="Número do contrato">
              <input value={numero} onChange={e => setNumero(e.target.value)} style={inputStyle} />
            </Campo>
            <Campo label="CNPJ">
              <input value={cnpjContratante} onChange={e => setCnpjContratante(e.target.value)} style={inputStyle} />
            </Campo>
          </div>

          <div style={grid2}>
            <Campo label="Processo administrativo">
              <input value={processoAdministrativo} onChange={e => setProcessoAdministrativo(e.target.value)} style={inputStyle} />
            </Campo>
            <Campo label="Modalidade de licitação">
              <input value={modalidadeLicitacao} onChange={e => setModalidadeLicitacao(e.target.value)} style={inputStyle} />
            </Campo>
          </div>

          <div style={grid2}>
            <Campo label="Cidade">
              <input value={cidade} onChange={e => setCidade(e.target.value)} style={inputStyle} />
            </Campo>
            <Campo label="Tipo de serviço">
              <select value={tipoServico} onChange={e => setTipoServico(e.target.value as TipoServicoContrato)} style={inputStyle}>
                {TIPOS_SERVICO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </Campo>
          </div>

          <div style={grid2}>
            <Campo label="Situação">
              <select value={status} onChange={e => setStatus(e.target.value as StatusContrato)} style={inputStyle}>
                <option value="vigente">Vigente</option>
                <option value="em_renovacao">Em renovação</option>
                <option value="encerrado">Encerrado</option>
              </select>
            </Campo>
            <Campo label="Valor total original (R$)">
              <input value={valorTotal} onChange={e => setValorTotal(e.target.value)} style={inputStyle} placeholder="1700111.70" />
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

          <Campo label="Objeto do contrato">
            <textarea value={objeto} onChange={e => setObjeto(e.target.value)}
              style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} />
          </Campo>

          <Campo label="Cláusula de reajuste">
            <input value={clausulaReajuste} onChange={e => setClausulaReajuste(e.target.value)} style={inputStyle}
              placeholder="ex.: IPCA/IBGE acumulado 12 meses" />
          </Campo>

          <Campo label="Observações">
            <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
              style={{ ...inputStyle, minHeight: 44, resize: 'vertical' }} />
          </Campo>

          {arquivoUrl && (
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
              <button type="button" onClick={visualizarArquivo} style={linkStyle}>Abrir PDF</button>
            </div>
          )}

          {/* ITENS VIGENTES */}
          {itensAtuais.length > 0 && (
            <div style={{ background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{
                padding: '10px 14px', background: '#f1f5f9',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                borderBottom: '1px solid #e5e7eb',
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                    ITENS VIGENTES ({itensAtuais.length})
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    {aditamentos.length > 0
                      ? 'Estado após o último aditamento. Para editar, faça um novo aditamento ou altere os aditamentos existentes.'
                      : 'Itens do contrato original.'}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#047857' }}>
                  {fmtReal(totalItens)}
                </div>
              </div>
              <TabelaItens itens={itensAtuais} />
            </div>
          )}

          {/* HISTÓRICO DE ADITAMENTOS */}
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
                  {aditamentos.map(ad => {
                    const cor = corTipoAditamento(ad.tipo)
                    const aberto = aditExpandidos.has(ad.id)
                    return (
                      <div key={ad.id} style={{
                        background: '#fafbff', border: '1px solid #e0e7ff',
                        borderLeft: `4px solid ${cor}`, borderRadius: 8, overflow: 'hidden',
                      }}>
                        <div style={{ padding: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                          <div style={{ flex: 1, minWidth: 200 }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{
                                fontSize: 10, fontWeight: 700, color: '#fff',
                                background: cor, padding: '2px 7px', borderRadius: 4, letterSpacing: 0.3,
                              }}>{ad.numero}º TA · {rotuloTipoAditamento(ad.tipo)}</span>
                              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{fmtData(ad.data)}</span>
                              {ad.percentualReajuste != null && (
                                <span style={{ fontSize: 11, color: '#1e40af', fontWeight: 600 }}>
                                  {ad.percentualReajuste.toFixed(2).replace('.', ',')}% {ad.indiceReajuste || ''}
                                </span>
                              )}
                            </div>
                            {ad.observacoes && (
                              <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>{ad.observacoes}</div>
                            )}
                            {ad.novoValorTotal != null && (
                              <div style={{ fontSize: 12, color: '#047857', fontWeight: 600, marginTop: 4 }}>
                                Valor: {fmtReal(ad.novoValorTotal)}
                                {ad.novaDataVencimento && <> • Vencimento: {fmtData(ad.novaDataVencimento)}</>}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {Array.isArray(ad.itensResultantes) && ad.itensResultantes.length > 0 && (
                              <button type="button" onClick={() => toggleExpandirAd(ad.id)} style={miniBtn('#64748b')}>
                                {aberto ? '▲ Ocultar' : `▼ Ver ${ad.itensResultantes.length} itens`}
                              </button>
                            )}
                            <button type="button" onClick={() => excluirAditamento(ad)} style={miniBtn('#b91c1c')}>Excluir</button>
                          </div>
                        </div>
                        {aberto && Array.isArray(ad.itensResultantes) && ad.itensResultantes.length > 0 && (
                          <div style={{ borderTop: '1px solid #e0e7ff', background: '#fff' }}>
                            <TabelaItens itens={ad.itensResultantes} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {adicionandoAditamento && (
                <NovoAditamento
                  contratoId={contrato.id} token={token}
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
          <button type="submit" disabled={salvando} style={{
            padding: '10px 20px',
            background: salvando ? '#94a3b8' : '#2D3A6B',
            color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: salvando ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ==== Subcomponente: novo aditamento avulso ====

interface NovoAditamentoProps {
  contratoId: string
  token: string
  onCancelar: () => void
  onAdicionado: (ad: Aditamento, contratoAtualizado?: Contrato) => void
}

function NovoAditamento({ contratoId, token, onCancelar, onAdicionado }: NovoAditamentoProps) {
  const [data, setData] = useState('')
  const [tipo, setTipo] = useState<TipoAditamento>('misto')
  const [novaDataVencimento, setNovaDataVencimento] = useState('')
  const [novoValorTotal, setNovoValorTotal] = useState('')
  const [percentualReajuste, setPercentualReajuste] = useState('')
  const [indiceReajuste, setIndiceReajuste] = useState('IPCA')
  const [observacoes, setObservacoes] = useState('')
  const [itensResultantes, setItensResultantes] = useState<ItemContrato[]>([])
  const [arquivoUrl, setArquivoUrl] = useState('')
  const [arquivoNome, setArquivoNome] = useState('')
  const [arquivoSize, setArquivoSize] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [extraindo, setExtraindo] = useState(false)
  const [mensagemIA, setMensagemIA] = useState('')
  const [erro, setErro] = useState('')
  const [aplicarVencimento, setAplicarVencimento] = useState(true)
  const [aplicarValor, setAplicarValor] = useState(true)
  const [salvando, setSalvando] = useState(false)

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
        const d = dEx.dados
        if (d.data) setData(d.data)
        if (d.tipo) setTipo(d.tipo)
        if (d.novaDataVencimento) setNovaDataVencimento(d.novaDataVencimento)
        if (d.novoValorTotal != null) setNovoValorTotal(String(d.novoValorTotal))
        if (d.percentualReajuste != null) setPercentualReajuste(String(d.percentualReajuste))
        if (d.indiceReajuste) setIndiceReajuste(d.indiceReajuste)
        if (d.observacoes) setObservacoes(d.observacoes)
        if (Array.isArray(d.itensResultantes)) {
          setItensResultantes(d.itensResultantes.map((it: any) => ({ ...it, id: uid() })))
        }
        const n = Object.values(d).filter(v => v != null).length
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
          data, tipo,
          novaDataVencimento: novaDataVencimento || undefined,
          novoValorTotal: novoValorTotal ? Number(novoValorTotal.replace(',', '.')) : undefined,
          percentualReajuste: percentualReajuste ? Number(percentualReajuste.replace(',', '.')) : undefined,
          indiceReajuste: indiceReajuste || undefined,
          observacoes: observacoes.trim() || undefined,
          arquivoUrl, arquivoNome, arquivoSize,
          itensResultantes,
          aplicarVencimento: aplicarVencimento && !!novaDataVencimento,
          aplicarValorTotal: aplicarValor && !!novoValorTotal,
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
          {extraindo && <div style={{ fontSize: 12, color: '#1d4ed8', marginTop: 6 }}>🔍 Analisando aditamento com IA...</div>}
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
          }} style={miniBtn('#b91c1c')}>Trocar</button>
        </div>
      )}

      {mensagemIA && (
        <div style={{ fontSize: 12, color: '#b45309', background: '#fef3c7', padding: 8, borderRadius: 6 }}>{mensagemIA}</div>
      )}

      <div style={grid2}>
        <Campo label="Data do aditamento *">
          <input type="date" value={data} onChange={e => setData(e.target.value)} style={inputStyle} />
        </Campo>
        <Campo label="Tipo">
          <select value={tipo} onChange={e => setTipo(e.target.value as TipoAditamento)} style={inputStyle}>
            <option value="reajuste">Reajuste</option>
            <option value="acrescimo">Acréscimo</option>
            <option value="supressao">Supressão</option>
            <option value="prorrogacao">Prorrogação</option>
            <option value="misto">Misto</option>
          </select>
        </Campo>
      </div>

      <div style={grid2}>
        <Campo label="Nova data de vencimento">
          <input type="date" value={novaDataVencimento} onChange={e => setNovaDataVencimento(e.target.value)} style={inputStyle} />
        </Campo>
        <Campo label="Novo valor total (R$)">
          <input value={novoValorTotal} onChange={e => setNovoValorTotal(e.target.value)} style={inputStyle} />
        </Campo>
      </div>

      <div style={grid2}>
        <Campo label="% Reajuste">
          <input value={percentualReajuste} onChange={e => setPercentualReajuste(e.target.value)} style={inputStyle} placeholder="4.56" />
        </Campo>
        <Campo label="Índice">
          <input value={indiceReajuste} onChange={e => setIndiceReajuste(e.target.value)} style={inputStyle} />
        </Campo>
      </div>

      <Campo label="Observações">
        <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
          style={{ ...inputStyle, minHeight: 44, resize: 'vertical' }} />
      </Campo>

      {itensResultantes.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #bbf7d0', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: '#f0fdf4', fontSize: 11, fontWeight: 700, color: '#166534', letterSpacing: 0.3 }}>
            ITENS RESULTANTES · {itensResultantes.length}
          </div>
          <TabelaItens itens={itensResultantes} />
        </div>
      )}

      {(novaDataVencimento || novoValorTotal) && (
        <div style={{ padding: 10, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
            Aplicar ao contrato principal:
          </div>
          {novaDataVencimento && (
            <label style={checkboxStyle}>
              <input type="checkbox" checked={aplicarVencimento} onChange={e => setAplicarVencimento(e.target.checked)} />
              Atualizar vencimento para <strong>{fmtData(novaDataVencimento)}</strong>
            </label>
          )}
          {novoValorTotal && (
            <label style={checkboxStyle}>
              <input type="checkbox" checked={aplicarValor} onChange={e => setAplicarValor(e.target.checked)} />
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

// ==== Componentes auxiliares ====

const TabelaItens = ({ itens }: { itens: ItemContrato[] }) => (
  <div style={{ overflowX: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ background: '#fafafa', color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.3 }}>
          <th style={thStyle}>#</th>
          <th style={thStyle}>Descrição</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Qtd</th>
          <th style={thStyle}>Unid</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>V. Unit.</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>V. Total</th>
        </tr>
      </thead>
      <tbody>
        {itens.map((it, idx) => (
          <tr key={it.id || idx} style={{ borderTop: '1px solid #f1f5f9' }}>
            <td style={tdStyle}>{String(idx + 1).padStart(2, '0')}</td>
            <td style={{ ...tdStyle, fontWeight: 600, color: '#1e293b' }}>{it.descricao}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{it.quantidade != null ? fmtNum(it.quantidade) : '—'}</td>
            <td style={tdStyle}>{it.unidade || '—'}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{it.valorUnitario != null ? fmtReal4(it.valorUnitario) : '—'}</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{it.valorTotal != null ? fmtReal(it.valorTotal) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

const Campo = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label style={{ display: 'block' }}>
    <div style={{ fontSize: 11, color: '#374151', fontWeight: 600, marginBottom: 4 }}>{label}</div>
    {children}
  </label>
)

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 11px', border: '1px solid #e5e7eb',
  borderRadius: 6, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box', background: '#fff',
}

const grid2: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10,
}

const linkStyle: React.CSSProperties = {
  fontSize: 12, color: '#0369a1', fontWeight: 600,
  background: 'transparent', border: 'none', cursor: 'pointer',
  fontFamily: 'inherit', padding: 0, textDecoration: 'underline',
}

const miniBtn = (cor: string): React.CSSProperties => ({
  padding: '5px 10px', background: 'transparent', color: cor,
  border: `1px solid ${cor}40`, borderRadius: 5, fontSize: 11, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit',
})

const checkboxStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: 12, color: '#374151', cursor: 'pointer',
}

const thStyle: React.CSSProperties = {
  padding: '7px 10px', textAlign: 'left', fontWeight: 600,
}

const tdStyle: React.CSSProperties = {
  padding: '7px 10px', color: '#334155',
}
