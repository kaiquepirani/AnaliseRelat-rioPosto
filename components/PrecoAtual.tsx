'use client'
import { useMemo } from 'react'
import { Extrato } from '@/lib/types'

const fmt3 = (v: number) => `R$ ${v.toFixed(3)}`

function parsarDataBR(data: string): Date | null {
  const m = data.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return null
  let ano = parseInt(m[3])
  if (ano < 100) ano += ano < 50 ? 2000 : 1900
  return new Date(ano, parseInt(m[2]) - 1, parseInt(m[1]))
}

const GRUPOS_COMB: Record<string, { label: string; cor: string; corTexto: string; keys: string[] }> = {
  diesel:   { label: 'Diesel / S10', cor: '#1e3a5f', corTexto: 'white',   keys: ['Diesel S10', 'Diesel', 'DIESEL S10', 'DIESEL'] },
  etanol:   { label: 'Álcool',       cor: '#15803d', corTexto: 'white',   keys: ['Etanol', 'Etanol Aditivado', 'ETANOL'] },
  gasolina: { label: 'Gasolina',     cor: '#b45309', corTexto: 'white',   keys: ['Gasolina', 'GASOLINA'] },
}

interface PrecoItem {
  preco: number
  data: string
  diasAtras: number
}

interface PostoPrecos {
  nome: string
  combustiveis: Record<string, PrecoItem | null>
}

export default function PrecoAtual({ extratos }: { extratos: Extrato[] }) {
  const postos = useMemo(() => {
    const mapaPostos: Record<string, Record<string, { preco: number; data: Date; dataStr: string }>> = {}
    const hoje = new Date()

    extratos.forEach(e => {
      e.postos.forEach(p => {
        if (!mapaPostos[p.nome]) mapaPostos[p.nome] = {}
        p.lancamentos.forEach(l => {
          if (!l.vlrUnitario || l.vlrUnitario <= 0) return
          const data = parsarDataBR(l.emissao)
          if (!data) return

          // Identificar grupo do combustível
          let grupoKey = ''
          for (const [key, grupo] of Object.entries(GRUPOS_COMB)) {
            if (grupo.keys.some(k => l.combustivelNome?.toUpperCase().includes(k.toUpperCase()))) {
              grupoKey = key
              break
            }
          }
          if (!grupoKey) return

          const atual = mapaPostos[p.nome][grupoKey]
          if (!atual || data > atual.data) {
            mapaPostos[p.nome][grupoKey] = {
              preco: l.vlrUnitario,
              data,
              dataStr: l.emissao,
            }
          }
        })
      })
    })

    return Object.entries(mapaPostos).map(([nome, combs]) => ({
      nome,
      combustiveis: Object.fromEntries(
        Object.keys(GRUPOS_COMB).map(key => {
          const item = combs[key]
          if (!item) return [key, null]
          const diasAtras = Math.floor((hoje.getTime() - item.data.getTime()) / (1000 * 60 * 60 * 24))
          return [key, { preco: item.preco, data: item.dataStr, diasAtras }]
        })
      )
    })).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [extratos])

  if (postos.length === 0) {
    return (
      <div className="estado-vazio">
        <div className="estado-icone">↑</div>
        <div className="estado-titulo">Nenhum dado disponível</div>
        <div className="estado-desc">Faça upload de extratos para ver os preços atuais por posto</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: '1.25rem' }}>
        Preço do último abastecimento registrado em cada posto. Atualiza automaticamente a cada novo extrato enviado.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
        {postos.map(posto => (
          <div key={posto.nome} style={{
            background: 'var(--surface)', borderRadius: 'var(--radius)',
            border: '1px solid var(--border)', overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}>
            {/* Header do posto */}
            <div style={{
              background: 'var(--navy)', color: 'white',
              padding: '0.75rem 1.1rem',
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{posto.nome}</div>
            </div>

            {/* Combustíveis */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--border)' }}>
              {Object.entries(GRUPOS_COMB).map(([key, grupo]) => {
                const item = posto.combustiveis[key]
                return (
                  <div key={key} style={{
                    background: 'var(--surface)',
                    padding: '0.875rem 1.1rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: grupo.cor, flexShrink: 0,
                      }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{grupo.label}</div>
                        {item && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                            {item.data} · {item.diasAtras === 0 ? 'hoje' : item.diasAtras === 1 ? 'ontem' : `${item.diasAtras}d atrás`}
                          </div>
                        )}
                      </div>
                    </div>
                    {item ? (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{
                          fontSize: 20, fontWeight: 700,
                          color: grupo.cor,
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {fmt3(item.preco)}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500 }}>por litro</div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: 'var(--text-3)', fontStyle: 'italic' }}>sem registro</div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Rodapé com data da última atualização */}
            <div style={{
              padding: '0.5rem 1.1rem', background: 'var(--bg)',
              fontSize: 11, color: 'var(--text-3)',
              borderTop: '1px solid var(--border)',
            }}>
              {(() => {
                const itens = Object.values(posto.combustiveis).filter(Boolean) as any[]
                if (itens.length === 0) return 'Sem dados'
                const maisRecente = itens.reduce((a, b) => {
                  const da = parsarDataBR(a.data)
                  const db = parsarDataBR(b.data)
                  if (!da || !db) return a
                  return da > db ? a : b
                })
                return `Última atualização: ${maisRecente.data}`
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
