'use client'

import { useState, useMemo, useCallback } from 'react'

// ─────────────────────────────────────────────────────────────────
// Tipos (espelham app/api/dp/fechamentos/route.ts)
// ─────────────────────────────────────────────────────────────────
interface Fechamento {
  id: string
  mesAno: string
  tipo: 'antecipacao' | 'folha'
  arquivo: string
  totalGeral: number
  totalPorCidade: Record<string, number>
  valorPorColaborador: Record<string, number>
  totalColaboradores: number
  dataImport: string
}

interface Props {
  fechamento: Fechamento
  onClose: () => void
  onSaved: () => void
}

// ─────────────────────────────────────────────────────────────────
// Helpers de formatação
// ─────────────────────────────────────────────────────────────────
const fmtBRL = (n: number): string =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const parseBRL = (s: string): number => {
  if (!s) return 0
  // Aceita "1.234,56" ou "1234,56" ou "1234.56"
  const cleaned = s.replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) || n < 0 ? 0 : n
}

const NAVY = '#2D3A6B'
const SKY = '#4AABDB'
const AMBER = '#f59e0b'

const fmtMes = (mesAno: string): string => {
  const [ano, mes] = mesAno.split('-')
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${meses[parseInt(mes, 10) - 1]}/${ano.slice(2)}`
}

// ─────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────
export default function EditarFechamentoModal({ fechamento, onClose, onSaved }: Props) {
  const [cidades, setCidades] = useState<Record<string, number>>(() => ({ ...fechamento.totalPorCidade }))
  const [colaboradores, setColaboradores] = useState<Record<string, number>>(() => ({ ...fechamento.valorPorColaborador }))
  const [aba, setAba] = useState<'cidades' | 'colaboradores'>('cidades')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')

  const totalCidades = useMemo(
    () => Object.values(cidades).reduce((s, v) => s + (v || 0), 0),
    [cidades]
  )
  const totalColabs = useMemo(
    () => Object.values(colaboradores).reduce((s, v) => s + (v || 0), 0),
    [colaboradores]
  )

  const cidadesOrdenadas = useMemo(
    () => Object.keys(cidades).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [cidades]
  )

  const colabsOrdenados = useMemo(() => {
    const filtro = busca.trim().toUpperCase()
    return Object.keys(colaboradores)
      .filter((nome) => !filtro || nome.includes(filtro))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [colaboradores, busca])

  const setCidadeValor = (cidade: string, valor: number) => {
    setCidades((prev) => ({ ...prev, [cidade]: valor }))
  }

  const setColabValor = (nome: string, valor: number) => {
    setColaboradores((prev) => ({ ...prev, [nome]: valor }))
  }

  const removerColab = (nome: string) => {
    setColaboradores((prev) => {
      const novo = { ...prev }
      delete novo[nome]
      return novo
    })
  }

  const variacao = totalCidades - fechamento.totalGeral
  const variacaoPct = fechamento.totalGeral > 0 ? (variacao / fechamento.totalGeral) * 100 : 0

  const salvar = useCallback(async () => {
    setErro('')
    setSalvando(true)
    try {
      const body = {
        ...fechamento,
        totalPorCidade: cidades,
        valorPorColaborador: colaboradores,
        totalGeral: totalCidades,
        totalColaboradores: Object.keys(colaboradores).length,
      }
      const res = await fetch('/api/dp/fechamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || data.erro) throw new Error(data.erro || 'Erro ao salvar')
      onSaved()
      onClose()
    } catch (e: any) {
      setErro(e.message || 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }, [fechamento, cidades, colaboradores, totalCidades, onSaved, onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 14,
          width: '100%',
          maxWidth: 760,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ background: NAVY, color: 'white', padding: '16px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.85, letterSpacing: 0.5 }}>EDITAR FECHAMENTO</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>
                {fmtMes(fechamento.mesAno)} — {fechamento.tipo === 'antecipacao' ? 'Antecipação' : 'Folha'}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                color: 'white',
                width: 32,
                height: 32,
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
              }}
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
          {(['cidades', 'colaboradores'] as const).map((t) => {
            const ativo = aba === t
            const label = t === 'cidades'
              ? `Por cidade (${cidadesOrdenadas.length})`
              : `Por colaborador (${Object.keys(colaboradores).length})`
            return (
              <button
                key={t}
                onClick={() => setAba(t)}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: 'none',
                  background: ativo ? 'white' : 'transparent',
                  color: ativo ? NAVY : '#6b7280',
                  fontWeight: ativo ? 700 : 500,
                  fontSize: 14,
                  cursor: 'pointer',
                  borderBottom: ativo ? `3px solid ${SKY}` : '3px solid transparent',
                  fontFamily: 'inherit',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Conteúdo */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {aba === 'cidades' ? (
            <>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
                Edite o valor pago em cada cidade. O <strong>Total Geral</strong> é recalculado como a soma dessas linhas e
                alimenta os gráficos.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cidadesOrdenadas.map((cidade) => (
                  <LinhaValor
                    key={cidade}
                    label={cidade}
                    valor={cidades[cidade]}
                    onChange={(v) => setCidadeValor(cidade, v)}
                  />
                ))}
                {cidadesOrdenadas.length === 0 && (
                  <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 20 }}>
                    Nenhuma cidade neste fechamento.
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>
                Edite o valor pago a cada colaborador. Use o <strong>X</strong> para remover um pagamento (ex.: funcionário
                que não foi pago neste mês). Esses valores aparecem no histórico individual em &quot;Controle de Pagamentos&quot;.
              </div>
              <input
                type="text"
                placeholder="Buscar colaborador…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  fontSize: 14,
                  marginBottom: 12,
                  fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {colabsOrdenados.map((nome) => (
                  <LinhaValor
                    key={nome}
                    label={nome}
                    valor={colaboradores[nome]}
                    onChange={(v) => setColabValor(nome, v)}
                    onRemove={() => removerColab(nome)}
                    pequeno
                  />
                ))}
                {colabsOrdenados.length === 0 && (
                  <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 20 }}>
                    {busca
                      ? 'Nenhum colaborador encontrado com esse filtro.'
                      : 'Este fechamento não tem valores individuais por colaborador (cidade usa parser por total).'}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer com resumo + ações */}
        <div style={{ borderTop: '1px solid #e5e7eb', background: '#f9fafb', padding: '14px 22px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 12, fontSize: 13 }}>
            <div>
              <div style={{ color: '#6b7280' }}>Total atual</div>
              <div style={{ fontWeight: 700, color: NAVY }}>R$ {fmtBRL(fechamento.totalGeral)}</div>
            </div>
            <div>
              <div style={{ color: '#6b7280' }}>Novo total (cidades)</div>
              <div style={{ fontWeight: 700, color: NAVY }}>R$ {fmtBRL(totalCidades)}</div>
            </div>
            <div>
              <div style={{ color: '#6b7280' }}>Soma colaboradores</div>
              <div style={{ fontWeight: 700, color: NAVY }}>R$ {fmtBRL(totalColabs)}</div>
            </div>
            <div>
              <div style={{ color: '#6b7280' }}>Variação</div>
              <div
                style={{
                  fontWeight: 700,
                  color: variacao === 0 ? '#6b7280' : variacao < 0 ? '#dc2626' : '#16a34a',
                }}
              >
                {variacao === 0
                  ? '—'
                  : `${variacao > 0 ? '+' : ''}R$ ${fmtBRL(variacao)} (${variacaoPct.toFixed(1)}%)`}
              </div>
            </div>
          </div>

          {erro && (
            <div
              style={{
                background: '#fee2e2',
                color: '#991b1b',
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 13,
                marginBottom: 10,
              }}
            >
              {erro}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              disabled={salvando}
              style={{
                padding: '10px 18px',
                border: '1px solid #e5e7eb',
                background: 'white',
                color: '#374151',
                borderRadius: 8,
                cursor: salvando ? 'default' : 'pointer',
                fontWeight: 600,
                fontSize: 14,
                fontFamily: 'inherit',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={salvando}
              style={{
                padding: '10px 22px',
                border: 'none',
                background: salvando ? '#9ca3af' : NAVY,
                color: 'white',
                borderRadius: 8,
                cursor: salvando ? 'default' : 'pointer',
                fontWeight: 700,
                fontSize: 14,
                fontFamily: 'inherit',
              }}
            >
              {salvando ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Subcomponente: linha editável (cidade ou colaborador)
// ─────────────────────────────────────────────────────────────────
interface LinhaProps {
  label: string
  valor: number
  onChange: (v: number) => void
  onRemove?: () => void
  pequeno?: boolean
}

const LinhaValor = ({ label, valor, onChange, onRemove, pequeno }: LinhaProps) => {
  const [texto, setTexto] = useState(fmtBRL(valor))

  // Sincroniza quando valor externo muda (ex.: reset)
  const valorRef = useMemo(() => ({ atual: valor }), [valor])
  if (valorRef.atual !== valor) {
    valorRef.atual = valor
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: pequeno ? '6px 10px' : '8px 12px',
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          flex: 1,
          fontSize: pequeno ? 13 : 14,
          fontWeight: 500,
          color: '#374151',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={label}
      >
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          padding: '0 8px',
        }}
      >
        <span style={{ fontSize: 12, color: '#6b7280', marginRight: 4 }}>R$</span>
        <input
          type="text"
          inputMode="decimal"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value)
            onChange(parseBRL(e.target.value))
          }}
          onBlur={() => setTexto(fmtBRL(parseBRL(texto)))}
          style={{
            width: 110,
            padding: '6px 0',
            border: 'none',
            background: 'transparent',
            fontSize: 14,
            fontWeight: 600,
            color: NAVY,
            textAlign: 'right',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          title="Remover deste fechamento"
          style={{
            background: 'transparent',
            border: '1px solid #fecaca',
            color: '#dc2626',
            width: 28,
            height: 28,
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}
