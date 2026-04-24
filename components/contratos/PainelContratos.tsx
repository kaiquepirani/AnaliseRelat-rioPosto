'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState, useCallback } from 'react'
import type { Contrato, ContratoComAlerta } from '@/lib/contratos-types'
import { calcularSituacao } from '@/lib/contratos-types'
import { abrirContratoPDF } from '@/lib/contratos-download'
import FormularioContrato from './FormularioContrato'

interface Props {
  token: string
  onLogout: () => void
}

const fmtReal = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtData = (iso: string) => {
  if (!iso) return '—'
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

const corSituacao = (s: ContratoComAlerta['situacao']) => {
  if (s === 'vencido')       return { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' }
  if (s === 'vencendo')      return { bg: '#fffbeb', border: '#fde68a', text: '#b45309' }
  if (s === 'em_renovacao')  return { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' }
  if (s === 'encerrado')     return { bg: '#f3f4f6', border: '#e5e7eb', text: '#4b5563' }
  return { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' }
}

const rotuloSituacao = (s: ContratoComAlerta['situacao']) => {
  if (s === 'vencido')       return 'VENCIDO'
  if (s === 'vencendo')      return 'VENCENDO'
  if (s === 'em_renovacao')  return 'EM RENOVAÇÃO'
  if (s === 'encerrado')     return 'ENCERRADO'
  return 'VIGENTE'
}

type FiltroSituacao = 'todos' | 'vigente' | 'vencendo' | 'vencido' | 'encerrado' | 'em_renovacao'

export default function PainelContratos({ token, onLogout }: Props) {
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroSituacao, setFiltroSituacao] = useState<FiltroSituacao>('todos')
  const [filtroCidade, setFiltroCidade] = useState<string>('')
  const [busca, setBusca] = useState('')
  const [formAberto, setFormAberto] = useState(false)
  const [emEdicao, setEmEdicao] = useState<Contrato | null>(null)

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const r = await fetch('/api/contratos', { headers })
      if (r.status === 401) { onLogout(); return }
      const data = await r.json()
      setContratos(Array.isArray(data) ? data : [])
    } finally {
      setCarregando(false)
    }
  }, [headers, onLogout])

  useEffect(() => { carregar() }, [carregar])

  const contratosComAlerta: ContratoComAlerta[] = useMemo(
    () => contratos.map(calcularSituacao),
    [contratos],
  )

  const cidades = useMemo(() => {
    const set = new Set<string>()
    for (const c of contratos) if (c.cidade) set.add(c.cidade)
    return Array.from(set).sort()
  }, [contratos])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return contratosComAlerta.filter(c => {
      if (filtroSituacao !== 'todos' && c.situacao !== filtroSituacao) return false
      if (filtroCidade && c.cidade !== filtroCidade) return false
      if (termo) {
        const alvo = `${c.cliente} ${c.numero} ${c.tipoServico} ${c.cidade}`.toLowerCase()
        if (alvo.indexOf(termo) === -1) return false
      }
      return true
    })
  }, [contratosComAlerta, filtroSituacao, filtroCidade, busca])

  const kpis = useMemo(() => {
    const vigentes = contratosComAlerta.filter(c => c.situacao === 'vigente' || c.situacao === 'vencendo')
    const vencendo = contratosComAlerta.filter(c => c.situacao === 'vencendo')
    const vencidos = contratosComAlerta.filter(c => c.situacao === 'vencido')
    const valorMensal = vigentes.reduce((acc, c) => acc + (c.valorMensal || 0), 0)
    return { vigentes: vigentes.length, vencendo: vencendo.length, vencidos: vencidos.length, valorMensal }
  }, [contratosComAlerta])

  const abrirNovo = () => { setEmEdicao(null); setFormAberto(true) }
  const abrirEdicao = (c: Contrato) => { setEmEdicao(c); setFormAberto(true) }
  const fecharForm = () => { setFormAberto(false); setEmEdicao(null) }

  const salvar = async (dados: Partial<Contrato>) => {
    const url = emEdicao ? `/api/contratos/${emEdicao.id}` : '/api/contratos'
    const method = emEdicao ? 'PUT' : 'POST'
    const r = await fetch(url, {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    })
    if (!r.ok) {
      const data = await r.json().catch(() => ({}))
      alert(data.erro || 'Erro ao salvar')
      return
    }
    fecharForm()
    await carregar()
  }

  const excluir = async (c: Contrato) => {
    if (!confirm(`Excluir o contrato de "${c.cliente}"? Esta ação não pode ser desfeita.`)) return
    const r = await fetch(`/api/contratos/${c.id}`, { method: 'DELETE', headers })
    if (!r.ok) { alert('Erro ao excluir'); return }
    await carregar()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6fb', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <header style={{
        background: '#2D3A6B', padding: '16px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Image src="/logo.png" alt="ETCO" width={48} height={48}
            style={{ objectFit: 'contain', background: '#fff', borderRadius: 8, padding: 4 }} />
          <div>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>Painel de Contratos</div>
            <div style={{ color: '#a8b5d9', fontSize: 12 }}>Gestão de contratos vigentes</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/" style={{
            background: 'rgba(255,255,255,0.12)', color: '#fff', padding: '8px 14px',
            borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600,
          }}>← Início</Link>
          <button onClick={onLogout} style={{
            background: 'rgba(255,255,255,0.12)', color: '#fff', padding: '8px 14px',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>Sair</button>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        {kpis.vencendo > 0 && (
          <div style={{
            marginBottom: 14, padding: '14px 18px', background: '#fffbeb',
            border: '1px solid #fde68a', borderLeft: '4px solid #f59e0b', borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 24 }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 700, color: '#92400e' }}>
                {kpis.vencendo === 1 ? '1 contrato vence' : `${kpis.vencendo} contratos vencem`} nos próximos 30 dias
              </div>
              <div style={{ fontSize: 13, color: '#a16207', marginTop: 2 }}>
                Revise e providencie a renovação antes do vencimento.
              </div>
            </div>
          </div>
        )}

        {kpis.vencidos > 0 && (
          <div style={{
            marginBottom: 14, padding: '14px 18px', background: '#fef2f2',
            border: '1px solid #fecaca', borderLeft: '4px solid #dc2626', borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 24 }}>🚨</span>
            <div>
              <div style={{ fontWeight: 700, color: '#991b1b' }}>
                {kpis.vencidos === 1 ? '1 contrato está vencido' : `${kpis.vencidos} contratos estão vencidos`}
              </div>
              <div style={{ fontSize: 13, color: '#b91c1c', marginTop: 2 }}>
                Atualize o status (renovado ou encerrado) para manter o painel correto.
              </div>
            </div>
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14, marginBottom: 20,
        }}>
          <KPI titulo="Contratos vigentes" valor={String(kpis.vigentes)} cor="#2D3A6B" />
          <KPI titulo="Vencendo em 30 dias" valor={String(kpis.vencendo)} cor="#f59e0b" />
          <KPI titulo="Vencidos" valor={String(kpis.vencidos)} cor="#dc2626" />
          <KPI titulo="Valor mensal total" valor={fmtReal(kpis.valorMensal)} cor="#4AABDB" />
        </div>

        <div style={{
          background: '#fff', padding: 14, borderRadius: 12,
          display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
          marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <input
            placeholder="Buscar por cliente, número, serviço..."
            value={busca} onChange={e => setBusca(e.target.value)}
            style={{
              flex: '1 1 220px', padding: '10px 12px', border: '1px solid #e5e7eb',
              borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none',
            }}
          />
          <select value={filtroSituacao} onChange={e => setFiltroSituacao(e.target.value as FiltroSituacao)} style={selectStyle}>
            <option value="todos">Todas as situações</option>
            <option value="vigente">Vigentes</option>
            <option value="vencendo">Vencendo</option>
            <option value="vencido">Vencidos</option>
            <option value="em_renovacao">Em renovação</option>
            <option value="encerrado">Encerrados</option>
          </select>
          <select value={filtroCidade} onChange={e => setFiltroCidade(e.target.value)} style={selectStyle}>
            <option value="">Todas as cidades</option>
            {cidades.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={abrirNovo} style={{
            padding: '10px 16px', background: '#2D3A6B', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>+ Novo contrato</button>
        </div>

        {carregando ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div style={{
            padding: 40, textAlign: 'center', color: '#64748b',
            background: '#fff', borderRadius: 12,
          }}>
            {contratos.length === 0
              ? 'Nenhum contrato cadastrado ainda. Clique em "+ Novo contrato" para começar.'
              : 'Nenhum contrato encontrado com esses filtros.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {filtrados.map(c => {
              const cor = corSituacao(c.situacao)
              return (
                <div key={c.id} style={{
                  background: '#fff', borderRadius: 12, padding: 18,
                  borderLeft: `4px solid ${cor.text}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
                          background: cor.bg, color: cor.text, border: `1px solid ${cor.border}`,
                          padding: '3px 8px', borderRadius: 4,
                        }}>{rotuloSituacao(c.situacao)}</span>
                        {c.numero && <span style={{ fontSize: 12, color: '#64748b' }}>Nº {c.numero}</span>}
                      </div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: '#1e293b', marginTop: 6 }}>
                        {c.cliente}
                      </div>
                      <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                        {c.tipoServico}{c.cidade ? ` • ${c.cidade}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Vencimento</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: cor.text }}>
                        {fmtData(c.dataVencimento)}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {c.situacao === 'vencido'
                          ? `Venceu há ${Math.abs(c.diasRestantes)} dia${Math.abs(c.diasRestantes) === 1 ? '' : 's'}`
                          : c.situacao === 'encerrado' || c.situacao === 'em_renovacao'
                          ? ''
                          : `Faltam ${c.diasRestantes} dia${c.diasRestantes === 1 ? '' : 's'}`}
                      </div>
                    </div>
                  </div>

                  {(c.valorMensal != null || c.valorTotal != null) && (
                    <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: 13, color: '#475569', flexWrap: 'wrap' }}>
                      {c.valorMensal != null && <span><strong>Mensal:</strong> {fmtReal(c.valorMensal)}</span>}
                      {c.valorTotal != null && <span><strong>Total:</strong> {fmtReal(c.valorTotal)}</span>}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    {c.arquivoUrl && (
                      <button
                        type="button"
                        onClick={() => abrirContratoPDF(c.id, c.arquivoNome, token)}
                        style={acaoStyle('#4AABDB')}
                      >
                        📄 Abrir PDF
                      </button>
                    )}
                    <button onClick={() => abrirEdicao(c)} style={acaoStyle('#2D3A6B')}>Editar</button>
                    <button onClick={() => excluir(c)} style={{
                      ...acaoStyle('#dc2626'),
                      background: 'transparent', color: '#dc2626', border: '1px solid #fecaca',
                    }}>Excluir</button>
                  </div>

                  {c.objeto && (
                    <div style={{ marginTop: 12, fontSize: 13, color: '#475569', background: '#f8fafc', padding: 10, borderRadius: 6 }}>
                      {c.objeto}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>

      {formAberto && (
        <FormularioContrato
          contrato={emEdicao} token={token}
          onCancelar={fecharForm} onSalvar={salvar}
        />
      )}
    </div>
  )
}

const KPI = ({ titulo, valor, cor }: { titulo: string; valor: string; cor: string }) => (
  <div style={{
    background: '#fff', padding: 16, borderRadius: 12,
    borderTop: `3px solid ${cor}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  }}>
    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {titulo}
    </div>
    <div style={{ fontSize: 22, fontWeight: 700, color: cor, marginTop: 6 }}>{valor}</div>
  </div>
)

const selectStyle: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8,
  fontSize: 14, background: '#fff', fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
}

const acaoStyle = (cor: string): React.CSSProperties => ({
  padding: '8px 14px', background: cor, color: '#fff', border: 'none',
  borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  textDecoration: 'none', fontFamily: 'inherit',
})
