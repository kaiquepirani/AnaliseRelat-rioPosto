'use client'
import { useState, useEffect, useMemo } from 'react'
import { FrotaVeiculo } from '@/lib/frota'

const GRUPOS = [
  'Carro Baixo Convencional', 'Spin 6+1', 'Doblo', 'Van 15 Teto Alto *',
  'Van 15 Teto Baixo', 'VAN MASTER', 'Micro Onibus 23 Lugares',
  'Micro Onibus Escolar - 23 Lugares', 'Micro Onibus Escolar - 34 Lugares',
  'Micro Onibus Convencional s/ Ar 27 Lugares', 'Micro Ônibus Executivo c/ Ar 32 Lugares *',
  'Ônibus Escolar 42 Lugares', 'ÔNIBUS ESCOLAR 45 LUGARES',
  'Ônibus Convencional s/ Ar 48 Lugares', 'Ônibus Executivo s/ Ar 46 Lugares',
  'Ônibus Executivo s/ Ar 50 Lugares', 'Ônibus Executivo c/ Ar 46 Lugares*',
  'Veículo Alugado', 'Outro',
]

const vazio: FrotaVeiculo = { nFrota: '', placa: '', grupo: '', marca: '', modelo: '' }

export default function GerenciarFrota() {
  const [frota, setFrota] = useState<FrotaVeiculo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [grupoBusca, setGrupoBusca] = useState('')
  const [form, setForm] = useState<FrotaVeiculo>(vazio)
  const [editando, setEditando] = useState<FrotaVeiculo | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [confirmandoDeletar, setConfirmandoDeletar] = useState<FrotaVeiculo | null>(null)

  const carregar = async () => {
    setCarregando(true)
    const res = await fetch('/api/frota')
    setFrota(await res.json())
    setCarregando(false)
  }

  useEffect(() => { carregar() }, [])

  const frotaFiltrada = useMemo(() => {
    return frota.filter(v => {
      const q = busca.toLowerCase()
      const matchBusca = !q || v.placa.toLowerCase().includes(q) || v.nFrota.includes(q) ||
        v.modelo.toLowerCase().includes(q) || v.marca.toLowerCase().includes(q)
      const matchGrupo = !grupoBusca || v.grupo === grupoBusca
      return matchBusca && matchGrupo
    }).sort((a, b) => a.nFrota.localeCompare(b.nFrota, undefined, { numeric: true }))
  }, [frota, busca, grupoBusca])

  const grupos = useMemo(() => Array.from(new Set(frota.map(v => v.grupo).filter(Boolean))).sort(), [frota])

  const abrirNovo = () => {
    setEditando(null)
    setForm(vazio)
    setMostrarForm(true)
  }

  const abrirEditar = (v: FrotaVeiculo) => {
    setEditando(v)
    setForm({ ...v })
    setMostrarForm(true)
  }

  const fecharForm = () => { setMostrarForm(false); setEditando(null); setForm(vazio) }

  const salvar = async () => {
    if (!form.nFrota.trim() || !form.placa.trim() || !form.grupo.trim()) {
      alert('Prefixo, Placa e Grupo são obrigatórios.')
      return
    }
    const placaNorm = form.placa.replace(/[-\s]/g, '').toUpperCase()
    setSalvando(true)
    try {
      if (editando) {
        await fetch('/api/frota', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ original: editando, atualizado: { ...form, placa: placaNorm } }) })
      } else {
        await fetch('/api/frota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, placa: placaNorm }) })
      }
      await carregar()
      fecharForm()
    } finally {
      setSalvando(false)
    }
  }

  const deletar = async (v: FrotaVeiculo) => {
    await fetch('/api/frota', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ placa: v.placa, nFrota: v.nFrota }) })
    setConfirmandoDeletar(null)
    await carregar()
  }

  const inp = (field: keyof FrotaVeiculo) => ({
    value: form[field],
    onChange: (e: any) => setForm(p => ({ ...p, [field]: e.target.value })),
    style: { width: '100%', padding: '0.45rem 0.75rem', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text)' } as any,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header com resumo e botão novo */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>Cadastro de Frota</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>{frota.length} veículos cadastrados</div>
        </div>
        <button onClick={abrirNovo} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0.6rem 1.2rem', fontSize: 13, fontWeight: 700,
          background: 'var(--navy)', color: 'white', border: 'none',
          borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          + Adicionar Veículo
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input placeholder="Buscar por placa, prefixo, modelo..." value={busca} onChange={e => setBusca(e.target.value)}
          style={{ flex: 1, minWidth: 220, padding: '0.45rem 0.75rem', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'inherit', background: 'var(--bg)' }} />
        <select value={grupoBusca} onChange={e => setGrupoBusca(e.target.value)}
          style={{ padding: '0.45rem 0.75rem', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'inherit', background: 'var(--bg)', minWidth: 200 }}>
          <option value="">Todos os grupos</option>
          {grupos.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <div style={{ fontSize: 12, color: 'var(--text-2)', alignSelf: 'center' }}>
          {frotaFiltrada.length} resultado{frotaFiltrada.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Formulário */}
      {mostrarForm && (
        <div style={{ background: 'var(--surface)', border: '2px solid var(--navy)', borderRadius: 'var(--radius)', padding: '1.25rem' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy)', marginBottom: '1rem' }}>
            {editando ? `Editando — ${editando.placa} (Prefixo ${editando.nFrota})` : 'Novo Veículo'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>PREFIXO *</label>
              <input {...inp('nFrota')} placeholder="ex: 4826" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>PLACA *</label>
              <input {...inp('placa')} placeholder="ex: ABC1D23" style={{ ...inp('placa').style, textTransform: 'uppercase' }} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>GRUPO *</label>
              <select value={form.grupo} onChange={e => setForm(p => ({ ...p, grupo: e.target.value }))}
                style={{ width: '100%', padding: '0.45rem 0.75rem', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', background: 'var(--bg)' }}>
                <option value="">Selecione o grupo...</option>
                {GRUPOS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>MARCA</label>
              <input {...inp('marca')} placeholder="ex: RENAULT" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 4 }}>MODELO</label>
              <input {...inp('modelo')} placeholder="ex: MASTER 2015>" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={salvar} disabled={salvando} style={{
              padding: '0.5rem 1.2rem', fontSize: 13, fontWeight: 700,
              background: salvando ? 'var(--border)' : 'var(--navy)', color: 'white',
              border: 'none', borderRadius: 6, cursor: salvando ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
            }}>{salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Adicionar veículo'}</button>
            <button onClick={fecharForm} style={{
              padding: '0.5rem 1rem', fontSize: 13, fontWeight: 500,
              background: 'transparent', color: 'var(--text-2)',
              border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit',
            }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Confirmação deletar */}
      {confirmandoDeletar && (
        <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 8, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--red)' }}>
            Remover <strong>{confirmandoDeletar.placa}</strong> (Prefixo {confirmandoDeletar.nFrota} — {confirmandoDeletar.modelo || confirmandoDeletar.grupo}) da frota?
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => deletar(confirmandoDeletar)} style={{ padding: '0.4rem 1rem', fontSize: 12, fontWeight: 700, background: 'var(--red)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>Confirmar</button>
            <button onClick={() => setConfirmandoDeletar(null)} style={{ padding: '0.4rem 0.8rem', fontSize: 12, background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Tabela */}
      {carregando ? (
        <div className="estado-vazio">Carregando frota...</div>
      ) : (
        <div className="tabela-hist-wrap">
          <table className="tabela tabela-sm">
            <thead>
              <tr>
                <th>Prefixo</th>
                <th>Placa</th>
                <th>Grupo</th>
                <th>Marca</th>
                <th>Modelo</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {frotaFiltrada.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '2rem' }}>Nenhum veículo encontrado</td></tr>
              ) : frotaFiltrada.map((v, i) => (
                <tr key={i}>
                  <td><span style={{ fontSize: 11, background: 'var(--sky-light)', color: 'var(--navy)', padding: '2px 8px', borderRadius: 20, fontWeight: 700 }}>{v.nFrota}</span></td>
                  <td><code>{v.placa}</code></td>
                  <td style={{ fontSize: 12 }}>{v.grupo}</td>
                  <td style={{ fontSize: 12 }}>{v.marca || '—'}</td>
                  <td style={{ fontSize: 12 }}>{v.modelo || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => abrirEditar(v)} style={{ padding: '3px 10px', fontSize: 11, fontWeight: 600, background: 'var(--sky-light)', color: 'var(--navy)', border: '1px solid var(--sky)', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit' }}>Editar</button>
                      <button onClick={() => setConfirmandoDeletar(v)} style={{ padding: '3px 8px', fontSize: 11, fontWeight: 600, background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid #fca5a5', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
