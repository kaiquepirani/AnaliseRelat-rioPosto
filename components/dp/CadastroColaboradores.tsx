'use client'
import { useState, useEffect, useCallback } from 'react'
import { Colaborador, Cidade, Funcao, DadosBancarios, StatusColaborador } from '@/lib/dp-types'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const CIDADES: Cidade[] = [
  'Águas de Lindóia (Folha)', 'Águas de Lindóia (Diárias)', 'Morungaba',
  'Mogi Mirim', 'Itapira (Escolar)', 'Itapira (Saúde)', 'Aguaí',
  'Casa Branca', 'Pinhal', 'Ubatuba', 'Porto Ferreira', 'Lindóia', 'Mococa', 'Rio Claro',
]

const FUNCOES: Funcao[] = ['Motorista', 'Monitor(a)', 'Mecânico', 'Administrativo', 'Contador', 'Outro']

const BANCOS = ['Banco do Brasil', 'Bradesco', 'Caixa Econômica Federal', 'Itaú', 'Nubank', 'Santander', 'Sicoob', 'Inter', 'Outro']

const STATUS_LABEL: Record<StatusColaborador, { label: string; cor: string; bg: string }> = {
  ativo:     { label: 'Ativo',     cor: '#16a34a', bg: '#f0fdf4' },
  inativo:   { label: 'Inativo',   cor: '#dc2626', bg: '#fef2f2' },
  afastado:  { label: 'Afastado',  cor: '#d97706', bg: '#fffbeb' },
}

function novoColaborador(): Partial<Colaborador> {
  return {
    nome: '', cpf: '', cidade: 'Águas de Lindóia (Folha)', funcao: 'Motorista',
    salarioBase: 0, dataInicio: '', status: 'ativo', observacoes: '',
    dadosBancarios: { banco: '', agencia: '', conta: '', pix: '', tipoConta: 'corrente' },
  }
}

export default function CadastroColaboradores() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState<Partial<Colaborador> | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroCidade, setFiltroCidade] = useState<Cidade | 'todas'>('todas')
  const [filtroStatus, setFiltroStatus] = useState<StatusColaborador | 'todos'>('todos')
  const [abaForm, setAbaForm] = useState<'dados' | 'banco'>('dados')

  const carregar = useCallback(async () => {
    const res = await fetch('/api/dp/colaboradores')
    setColaboradores(await res.json())
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const salvar = async () => {
    if (!editando?.nome?.trim() || !editando?.salarioBase) return
    setSalvando(true)
    const agora = new Date().toISOString()
    const colab: Colaborador = {
      id: editando.id || `colab_${Date.now()}`,
      nome: editando.nome!.trim(),
      cpf: editando.cpf?.trim(),
      cidade: editando.cidade!,
      funcao: editando.funcao!,
      salarioBase: editando.salarioBase!,
      dataInicio: editando.dataInicio || '',
      dataDesligamento: editando.dataDesligamento,
      status: editando.status!,
      dadosBancarios: editando.dadosBancarios!,
      observacoes: editando.observacoes?.trim(),
      createdAt: editando.createdAt || agora,
      updatedAt: agora,
    }
    await fetch('/api/dp/colaboradores', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(colab),
    })
    await carregar()
    setEditando(null)
    setSalvando(false)
  }

  const remover = async (id: string) => {
    if (!confirm('Remover este colaborador? Esta ação não pode ser desfeita.')) return
    await fetch('/api/dp/colaboradores', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await carregar()
  }

  const atualizar = (campo: string, valor: any) => {
    setEditando(prev => {
      if (!prev) return prev
      if (campo.startsWith('banco.')) {
        const subcampo = campo.split('.')[1]
        return { ...prev, dadosBancarios: { ...prev.dadosBancarios, [subcampo]: valor } as DadosBancarios }
      }
      return { ...prev, [campo]: valor }
    })
  }

  const filtrados = colaboradores.filter(c => {
    const matchBusca = busca === '' || c.nome.toLowerCase().includes(busca.toLowerCase()) || c.cpf?.includes(busca)
    const matchCidade = filtroCidade === 'todas' || c.cidade === filtroCidade
    const matchStatus = filtroStatus === 'todos' || c.status === filtroStatus
    return matchBusca && matchCidade && matchStatus
  })

  // Agrupado por cidade para exibição
  const porCidade = CIDADES.map(cidade => ({
    cidade,
    colaboradores: filtrados.filter(c => c.cidade === cidade),
  })).filter(g => g.colaboradores.length > 0)

  const totalAtivos = colaboradores.filter(c => c.status === 'ativo').length
  const totalMassa = colaboradores.filter(c => c.status === 'ativo').reduce((s, c) => s + c.salarioBase, 0)

  const inputStyle = {
    padding: '0.45rem 0.75rem', fontSize: 13, borderRadius: 6,
    border: '1px solid var(--border)', fontFamily: 'inherit',
    background: 'var(--bg)', color: 'var(--text)', width: '100%',
  }

  const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', display: 'block', marginBottom: 4 }

  // ⚠️ TEMPORÁRIO — remove todos os colaboradores
  const limparTudo = async () => {
    if (!confirm('⚠️ Isso vai remover TODOS os colaboradores. Confirma?')) return
    await fetch('/api/dp/colaboradores', { method: 'PATCH' })
    await carregar()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── Cards resumo ── */}
      <div className="cards-grid">
        <div className="card">
          <div className="card-label">Total colaboradores</div>
          <div className="card-valor">{colaboradores.length}</div>
          <div className="card-sub">{totalAtivos} ativos</div>
        </div>
        <div className="card">
          <div className="card-label">Massa salarial</div>
          <div className="card-valor" style={{ fontSize: 18 }}>{fmt(totalMassa)}</div>
          <div className="card-sub">salários base (ativos)</div>
        </div>
        <div className="card">
          <div className="card-label">Antecipação estimada (40%)</div>
          <div className="card-valor" style={{ fontSize: 18 }}>{fmt(totalMassa * 0.4)}</div>
          <div className="card-sub">dia 20</div>
        </div>
        <div className="card">
          <div className="card-label">Cidades ativas</div>
          <div className="card-valor">{CIDADES.filter(c => colaboradores.some(col => col.cidade === c && col.status === 'ativo')).length}</div>
          <div className="card-sub">de {CIDADES.length} unidades</div>
        </div>
      </div>

      {/* ── Filtros + botão novo ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '0.875rem 1rem', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
        <input
          value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por nome ou CPF..."
          style={{ ...inputStyle, minWidth: 220, flex: 1 }}
        />
        <select value={filtroCidade} onChange={e => setFiltroCidade(e.target.value as any)} style={{ ...inputStyle, width: 'auto', minWidth: 180 }}>
          <option value="todas">Todas as cidades</option>
          {CIDADES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as any)} style={{ ...inputStyle, width: 'auto' }}>
          <option value="todos">Todos os status</option>
          <option value="ativo">Ativos</option>
          <option value="inativo">Inativos</option>
          <option value="afastado">Afastados</option>
        </select>
        {/* ⚠️ TEMPORÁRIO */}
        {colaboradores.length > 0 && (
          <button onClick={limparTudo} style={{
            padding: '0.45rem 1rem', fontSize: 12, fontWeight: 700,
            background: '#fef2f2', color: '#dc2626',
            border: '1.5px solid #fca5a5', borderRadius: 8,
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>🗑️ Limpar tudo</button>
        )}
        <button onClick={() => { setEditando(novoColaborador()); setAbaForm('dados') }} style={{
          padding: '0.45rem 1.1rem', fontSize: 13, fontWeight: 700,
          background: 'var(--navy)', color: 'white', border: 'none',
          borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}>+ Novo colaborador</button>
      </div>

      {/* ── Modal de edição ── */}
      {editando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: 'white', borderRadius: 16, padding: '2rem', maxWidth: 580, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)' }}>
                {editando.id ? 'Editar colaborador' : 'Novo colaborador'}
              </div>
              <button onClick={() => setEditando(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-3)' }}>✕</button>
            </div>

            {/* Abas do form */}
            <div style={{ display: 'flex', gap: 2, marginBottom: '1.25rem', background: 'var(--bg)', borderRadius: 8, padding: 3 }}>
              {(['dados', 'banco'] as const).map(aba => (
                <button key={aba} onClick={() => setAbaForm(aba)} style={{
                  flex: 1, padding: '6px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none',
                  background: abaForm === aba ? 'var(--navy)' : 'transparent',
                  color: abaForm === aba ? 'white' : 'var(--text-2)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{aba === 'dados' ? '👤 Dados pessoais' : '🏦 Dados bancários'}</button>
              ))}
            </div>

            {abaForm === 'dados' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Nome completo *</label>
                  <input value={editando.nome || ''} onChange={e => atualizar('nome', e.target.value)} style={inputStyle} placeholder="Nome completo" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>CPF</label>
                    <input value={editando.cpf || ''} onChange={e => atualizar('cpf', e.target.value)} style={inputStyle} placeholder="000.000.000-00" />
                  </div>
                  <div>
                    <label style={labelStyle}>Data de início *</label>
                    <input value={editando.dataInicio || ''} onChange={e => atualizar('dataInicio', e.target.value)} style={inputStyle} placeholder="dd/mm/aaaa" />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Cidade *</label>
                    <select value={editando.cidade || ''} onChange={e => atualizar('cidade', e.target.value)} style={inputStyle}>
                      {CIDADES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Função *</label>
                    <select value={editando.funcao || ''} onChange={e => atualizar('funcao', e.target.value)} style={inputStyle}>
                      {FUNCOES.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Salário base (R$) *</label>
                    <input
                      type="number" step="0.01" min="0"
                      value={editando.salarioBase || ''}
                      onChange={e => atualizar('salarioBase', parseFloat(e.target.value) || 0)}
                      style={inputStyle} placeholder="0,00"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select value={editando.status || 'ativo'} onChange={e => atualizar('status', e.target.value)} style={inputStyle}>
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                      <option value="afastado">Afastado</option>
                    </select>
                  </div>
                </div>
                {(editando.status === 'inativo') && (
                  <div>
                    <label style={labelStyle}>Data de desligamento</label>
                    <input value={editando.dataDesligamento || ''} onChange={e => atualizar('dataDesligamento', e.target.value)} style={inputStyle} placeholder="dd/mm/aaaa" />
                  </div>
                )}
                <div>
                  <label style={labelStyle}>Observações</label>
                  <input value={editando.observacoes || ''} onChange={e => atualizar('observacoes', e.target.value)} style={inputStyle} placeholder="Ex: Grávida, aposentado, cargo confiança..." />
                </div>
              </div>
            )}

            {abaForm === 'banco' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Banco</label>
                    <select value={editando.dadosBancarios?.banco || ''} onChange={e => atualizar('banco.banco', e.target.value)} style={inputStyle}>
                      <option value="">— Selecione —</option>
                      {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Tipo de conta</label>
                    <select value={editando.dadosBancarios?.tipoConta || 'corrente'} onChange={e => atualizar('banco.tipoConta', e.target.value)} style={inputStyle}>
                      <option value="corrente">Corrente</option>
                      <option value="poupança">Poupança</option>
                      <option value="salário">Salário</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Agência</label>
                    <input value={editando.dadosBancarios?.agencia || ''} onChange={e => atualizar('banco.agencia', e.target.value)} style={inputStyle} placeholder="0000" />
                  </div>
                  <div>
                    <label style={labelStyle}>Conta</label>
                    <input value={editando.dadosBancarios?.conta || ''} onChange={e => atualizar('banco.conta', e.target.value)} style={inputStyle} placeholder="00000-0" />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Chave PIX</label>
                  <input value={editando.dadosBancarios?.pix || ''} onChange={e => atualizar('banco.pix', e.target.value)} style={inputStyle} placeholder="CPF, telefone, e-mail ou chave aleatória" />
                </div>
                <div style={{ background: 'var(--sky-light)', borderRadius: 8, padding: '0.75rem', fontSize: 12, color: 'var(--text-2)' }}>
                  💡 Preencha pelo menos uma forma de pagamento: conta bancária (agência + conta) ou chave PIX.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setEditando(null)} style={{ padding: '0.55rem 1.1rem', fontSize: 13, background: 'white', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={salvar} disabled={salvando || !editando.nome?.trim()} style={{
                padding: '0.55rem 1.25rem', fontSize: 13, fontWeight: 700,
                background: 'var(--navy)', color: 'white', border: 'none',
                borderRadius: 8, cursor: salvando ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', opacity: salvando || !editando.nome?.trim() ? 0.6 : 1,
              }}>{salvando ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lista agrupada por cidade ── */}
      {carregando ? (
        <div className="estado-vazio">Carregando colaboradores...</div>
      ) : filtrados.length === 0 ? (
        <div className="estado-vazio">
          <div className="estado-icone">👥</div>
          <div className="estado-titulo">Nenhum colaborador encontrado</div>
          <div className="estado-desc">Adicione o primeiro colaborador ou ajuste os filtros</div>
        </div>
      ) : (
        porCidade.map(({ cidade, colaboradores: lista }) => (
          <div key={cidade} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
            {/* Header da cidade */}
            <div style={{ padding: '0.875rem 1.25rem', background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'white' }}>{cidade}</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                <span>{lista.length} colaborador{lista.length !== 1 ? 'es' : ''}</span>
                <span style={{ color: 'rgba(255,255,255,0.5)' }}>·</span>
                <span>Massa: <strong style={{ color: 'white' }}>{fmt(lista.filter(c => c.status === 'ativo').reduce((s, c) => s + c.salarioBase, 0))}</strong></span>
              </div>
            </div>

            {/* Tabela */}
            <table className="tabela tabela-sm">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Função</th>
                  <th style={{ textAlign: 'right' }}>Salário base</th>
                  <th>Banco / PIX</th>
                  <th>Início</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lista.map(c => {
                  const st = STATUS_LABEL[c.status]
                  const banco = c.dadosBancarios?.banco || '—'
                  const pix = c.dadosBancarios?.pix
                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{c.nome}</div>
                        {c.cpf && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.cpf}</div>}
                        {c.observacoes && <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 2 }}>📌 {c.observacoes}</div>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{c.funcao}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(c.salarioBase)}</td>
                      <td style={{ fontSize: 12 }}>
                        <div>{banco}</div>
                        {pix && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>PIX: {pix}</div>}
                        {c.dadosBancarios?.conta && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Ag {c.dadosBancarios.agencia} · C {c.dadosBancarios.conta}</div>}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{c.dataInicio || '—'}</td>
                      <td>
                        <span style={{ fontSize: 11, fontWeight: 600, color: st.cor, background: st.bg, padding: '2px 8px', borderRadius: 20, border: `1px solid ${st.cor}33` }}>{st.label}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => { setEditando(c); setAbaForm('dados') }} style={{ padding: '3px 8px', fontSize: 11, background: 'var(--bg)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit' }}>Editar</button>
                          <button onClick={() => remover(c.id)} style={{ padding: '3px 8px', fontSize: 11, background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid #fca5a5', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit' }}>Remover</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  )
}
