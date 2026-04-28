'use client'

import { useState, useCallback, useMemo } from 'react'

// ─────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────
interface Fechamento {
  id: string
  mesAno: string
  tipo: 'antecipacao' | 'folha'
  totalGeral: number
  totalPorCidade: Record<string, number>
  valorPorColaborador?: Record<string, number>
  arquivo: string
  totalColaboradores?: number
  dataImport: string
}

interface Props {
  colaboradorNome: string
  colaboradorCidade: string
  mesAno: string
  fechAntecip?: Fechamento
  fechFolha?: Fechamento
  onClose: () => void
  onSaved: () => Promise<void> | void
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
const fmt = (n: number): string =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtBRL = (n: number): string =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const parseBRL = (s: string): number => {
  if (!s) return 0
  const cleaned = s.replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) || n < 0 ? 0 : n
}

function labelMesAno(ma: string): string {
  const [ano, mes] = ma.split('-')
  const nomes = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
  return `${nomes[parseInt(mes) - 1]}/${ano}`
}

// ─────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────
export default function EditarPagamentoColaboradorModal({
  colaboradorNome,
  colaboradorCidade,
  mesAno,
  fechAntecip,
  fechFolha,
  onClose,
  onSaved,
}: Props) {
  const nomeKey = colaboradorNome.trim().toUpperCase()

  const valorAntecipAtual = fechAntecip?.valorPorColaborador?.[nomeKey] ?? 0
  const valorFolhaAtual = fechFolha?.valorPorColaborador?.[nomeKey] ?? 0

  const [textoAntecip, setTextoAntecip] = useState(fmtBRL(valorAntecipAtual))
  const [textoFolha, setTextoFolha] = useState(fmtBRL(valorFolhaAtual))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const novoAntecip = useMemo(() => parseBRL(textoAntecip), [textoAntecip])
  const novoFolha = useMemo(() => parseBRL(textoFolha), [textoFolha])

  const deltaAntecip = novoAntecip - valorAntecipAtual
  const deltaFolha = novoFolha - valorFolhaAtual
  const deltaTotal = deltaAntecip + deltaFolha

  // Totais antes/depois
  const totalCidadeAntes =
    (fechAntecip?.totalPorCidade?.[colaboradorCidade] ?? 0) +
    (fechFolha?.totalPorCidade?.[colaboradorCidade] ?? 0)
  const totalCidadeDepois = totalCidadeAntes + deltaTotal

  const totalMesAntes = (fechAntecip?.totalGeral ?? 0) + (fechFolha?.totalGeral ?? 0)
  const totalMesDepois = totalMesAntes + deltaTotal

  const houveAlteracao = deltaAntecip !== 0 || deltaFolha !== 0

  const salvar = useCallback(async () => {
    if (!houveAlteracao) {
      onClose()
      return
    }
    setErro('')
    setSalvando(true)

    try {
      // ─── 1. Atualiza antecipação se mudou ──────────────────────────
      if (fechAntecip && deltaAntecip !== 0) {
        const novoVPC: Record<string, number> = { ...(fechAntecip.valorPorColaborador ?? {}) }
        if (novoAntecip > 0) novoVPC[nomeKey] = novoAntecip
        else delete novoVPC[nomeKey]

        const novoTPC: Record<string, number> = { ...fechAntecip.totalPorCidade }
        const valCidade = (novoTPC[colaboradorCidade] ?? 0) + deltaAntecip
        if (valCidade > 0.005) novoTPC[colaboradorCidade] = Math.round(valCidade * 100) / 100
        else delete novoTPC[colaboradorCidade]

        const novoFech = {
          ...fechAntecip,
          valorPorColaborador: novoVPC,
          totalPorCidade: novoTPC,
          totalGeral: Math.round((fechAntecip.totalGeral + deltaAntecip) * 100) / 100,
          totalColaboradores: Object.keys(novoVPC).length,
        }

        const res = await fetch('/api/dp/fechamentos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(novoFech),
        })
        const d = await res.json()
        if (!res.ok || d.erro) throw new Error(d.erro || 'Erro ao salvar antecipação')
      }

      // ─── 2. Atualiza complemento se mudou ──────────────────────────
      if (fechFolha && deltaFolha !== 0) {
        const novoVPC: Record<string, number> = { ...(fechFolha.valorPorColaborador ?? {}) }
        if (novoFolha > 0) novoVPC[nomeKey] = novoFolha
        else delete novoVPC[nomeKey]

        const novoTPC: Record<string, number> = { ...fechFolha.totalPorCidade }
        const valCidade = (novoTPC[colaboradorCidade] ?? 0) + deltaFolha
        if (valCidade > 0.005) novoTPC[colaboradorCidade] = Math.round(valCidade * 100) / 100
        else delete novoTPC[colaboradorCidade]

        const novoFech = {
          ...fechFolha,
          valorPorColaborador: novoVPC,
          totalPorCidade: novoTPC,
          totalGeral: Math.round((fechFolha.totalGeral + deltaFolha) * 100) / 100,
          totalColaboradores: Object.keys(novoVPC).length,
        }

        const res = await fetch('/api/dp/fechamentos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(novoFech),
        })
        const d = await res.json()
        if (!res.ok || d.erro) throw new Error(d.erro || 'Erro ao salvar complemento')
      }

      await onSaved()
      onClose()
    } catch (e: any) {
      setErro(e.message || 'Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }, [houveAlteracao, fechAntecip, fechFolha, deltaAntecip, deltaFolha, novoAntecip, novoFolha, nomeKey, colaboradorCidade, onSaved, onClose])

  const NAVY = '#2D3A6B'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,20,40,0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        fontFamily: 'inherit',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 16,
          width: '100%',
          maxWidth: 540,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div style={{ background: NAVY, color: 'white', padding: '18px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 0.5, fontWeight: 600 }}>
                EDITAR PAGAMENTO
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, lineHeight: 1.2 }}>
                {colaboradorNome}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap', fontSize: 12 }}>
                <span style={{ opacity: 0.7 }}>{colaboradorCidade}</span>
                <span style={{ opacity: 0.5 }}>•</span>
                <span style={{ opacity: 0.7 }}>{labelMesAno(mesAno)}</span>
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
                fontSize: 16,
                lineHeight: 1,
                fontFamily: 'inherit',
              }}
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body — campos */}
        <div style={{ padding: '20px 22px', flex: 1, overflowY: 'auto' }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16, lineHeight: 1.5 }}>
            Edite os valores efetivamente pagos. O <strong>total da cidade</strong> e o <strong>total do mês</strong> são
            recalculados automaticamente, refletindo nos gráficos do Resumo.
          </div>

          {/* Antecipação */}
          <CampoValor
            label="Antecipação"
            sublabel="pago dia 20"
            cor="#d97706"
            corBg="#fffbeb"
            corBorda="#fde68a"
            valor={textoAntecip}
            valorAntigo={valorAntecipAtual}
            delta={deltaAntecip}
            disabled={!fechAntecip}
            mensagemDisabled="Não há fechamento de antecipação importado para este mês"
            onChange={setTextoAntecip}
          />

          <div style={{ height: 12 }} />

          {/* Complemento */}
          <CampoValor
            label="Complemento"
            sublabel="pago dia 10 do mês seguinte"
            cor="#16a34a"
            corBg="#f0fdf4"
            corBorda="#bbf7d0"
            valor={textoFolha}
            valorAntigo={valorFolhaAtual}
            delta={deltaFolha}
            disabled={!fechFolha}
            mensagemDisabled="Não há fechamento de folha importado para este mês"
            onChange={setTextoFolha}
          />

          {/* Resumo do impacto */}
          <div
            style={{
              marginTop: 18,
              padding: '14px 16px',
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: 10,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              Impacto da alteração
            </div>

            <LinhaImpacto label={`Total ${colaboradorCidade}`} antes={totalCidadeAntes} depois={totalCidadeDepois} />
            <LinhaImpacto label={`Total ${labelMesAno(mesAno)}`} antes={totalMesAntes} depois={totalMesDepois} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e5e7eb', background: '#f9fafb', padding: '14px 22px' }}>
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

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
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
              disabled={salvando || !houveAlteracao}
              style={{
                padding: '10px 22px',
                border: 'none',
                background: salvando || !houveAlteracao ? '#9ca3af' : NAVY,
                color: 'white',
                borderRadius: 8,
                cursor: salvando || !houveAlteracao ? 'default' : 'pointer',
                fontWeight: 700,
                fontSize: 14,
                fontFamily: 'inherit',
              }}
            >
              {salvando ? 'Salvando…' : houveAlteracao ? 'Salvar alterações' : 'Sem alterações'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Subcomponente: campo de valor
// ─────────────────────────────────────────────────────────────────
interface CampoProps {
  label: string
  sublabel: string
  cor: string
  corBg: string
  corBorda: string
  valor: string
  valorAntigo: number
  delta: number
  disabled: boolean
  mensagemDisabled: string
  onChange: (v: string) => void
}

const CampoValor = (props: CampoProps) => {
  const { label, sublabel, cor, corBg, corBorda, valor, valorAntigo, delta, disabled, mensagemDisabled, onChange } = props

  return (
    <div
      style={{
        background: disabled ? '#f9fafb' : corBg,
        border: `1px solid ${disabled ? '#e5e7eb' : corBorda}`,
        borderRadius: 10,
        padding: '12px 14px',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: disabled ? '#6b7280' : cor }}>
            {label}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{sublabel}</div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: '0 10px',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <span style={{ fontSize: 12, color: '#6b7280', marginRight: 4, fontWeight: 600 }}>R$</span>
          <input
            type="text"
            inputMode="decimal"
            value={valor}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => onChange(fmtBRL(parseBRL(valor)))}
            style={{
              width: 120,
              padding: '8px 0',
              border: 'none',
              background: 'transparent',
              fontSize: 15,
              fontWeight: 700,
              color: disabled ? '#9ca3af' : cor,
              textAlign: 'right',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {disabled ? (
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, fontStyle: 'italic' }}>
          {mensagemDisabled}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <span>Valor anterior: <strong>{fmt(valorAntigo)}</strong></span>
          {delta !== 0 && (
            <span style={{ color: delta > 0 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>
              {delta > 0 ? '+' : ''}{fmt(delta)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Subcomponente: linha de impacto
// ─────────────────────────────────────────────────────────────────
const LinhaImpacto = ({ label, antes, depois }: { label: string; antes: number; depois: number }) => {
  const mudou = Math.abs(antes - depois) > 0.005
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: '#6b7280', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
        <span style={{ color: mudou ? '#9ca3af' : '#374151', textDecoration: mudou ? 'line-through' : 'none' }}>
          {fmt(antes)}
        </span>
        {mudou && (
          <>
            <span style={{ color: '#9ca3af' }}>→</span>
            <span style={{ color: '#2D3A6B', fontWeight: 800 }}>{fmt(depois)}</span>
          </>
        )}
      </div>
    </div>
  )
}
