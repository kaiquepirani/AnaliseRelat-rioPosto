'use client'
import { useMemo } from 'react'
import { Extrato } from '@/lib/types'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const fmt3 = (v: number) => `R$ ${v.toFixed(3)}`
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function parsarDataBR(data: string): Date | null {
  const m = data.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!m) return null
  let ano = parseInt(m[3])
  if (ano < 100) ano += ano < 50 ? 2000 : 1900
  return new Date(ano, parseInt(m[2]) - 1, parseInt(m[1]))
}

export default function AnalisePrecoCombustivel({ extratos }: { extratos: Extrato[] }) {
  const { porPostoComb, evolucao, alertas } = useMemo(() => {
    const postoCombMap: Record<string, { litros: number; valor: number; qtd: number }> = {}
    const evolucaoMap: Record<string, Record<string, { soma: number; qtd: number }>> = {}
    const alertas: { placa: string; posto: string; data: string; combustivel: string; preco: number; mediaGeral: number; diff: number }[] = []

    const mediasComb: Record<string, { soma: number; qtd: number }> = {}

    extratos.forEach(e => {
      e.postos.forEach(p => {
        p.lancamentos.forEach(l => {
          if (!l.vlrUnitario || l.vlrUnitario <= 0 || !l.litros) return
          const key = `${p.nome}||${l.combustivelNome}`
          if (!postoCombMap[key]) postoCombMap[key] = { litros: 0, valor: 0, qtd: 0 }
          postoCombMap[key].litros += l.litros
          postoCombMap[key].valor += l.valor
          postoCombMap[key].qtd += 1

          if (!mediasComb[l.combustivelNome]) mediasComb[l.combustivelNome] = { soma: 0, qtd: 0 }
          mediasComb[l.combustivelNome].soma += l.vlrUnitario
          mediasComb[l.combustivelNome].qtd += 1

          const data = parsarDataBR(l.emissao)
          if (data) {
            const mesAno = `${String(data.getMonth() + 1).padStart(2, '0')}/${data.getFullYear()}`
            if (!evolucaoMap[mesAno]) evolucaoMap[mesAno] = {}
            if (!evolucaoMap[mesAno][l.combustivelNome]) evolucaoMap[mesAno][l.combustivelNome] = { soma: 0, qtd: 0 }
            evolucaoMap[mesAno][l.combustivelNome].soma += l.vlrUnitario
            evolucaoMap[mesAno][l.combustivelNome].qtd += 1
          }
        })
      })
    })

    // Calcular médias globais e detectar alertas
    const mediasFinais: Record<string, number> = {}
    Object.entries(mediasComb).forEach(([comb, d]) => {
      mediasFinais[comb] = d.soma / d.qtd
    })

    extratos.forEach(e => {
      e.postos.forEach(p => {
        p.lancamentos.forEach(l => {
          if (!l.vlrUnitario || l.vlrUnitario <= 0) return
          const media = mediasFinais[l.combustivelNome]
          if (!media) return
          const diff = ((l.vlrUnitario - media) / media) * 100
          if (diff > 10) {
            alertas.push({
              placa: l.placaLida,
              posto: p.nome,
              data: l.emissao,
              combustivel: l.combustivelNome,
              preco: l.vlrUnitario,
              mediaGeral: media,
              diff,
            })
          }
        })
      })
    })

    const porPostoComb = Object.entries(postoCombMap).map(([key, d]) => {
      const [posto, combustivel] = key.split('||')
      return { posto, combustivel, precoMedio: d.valor / d.litros, litros: d.litros, qtd: d.qtd }
    }).sort((a, b) => a.combustivel.localeCompare(b.combustivel) || a.posto.localeCompare(b.posto))

    const evolucao = Object.entries(evolucaoMap)
      .sort(([a], [b]) => {
        const [ma, ya] = a.split('/').map(Number)
        const [mb, yb] = b.split('/').map(Number)
        return ya !== yb ? ya - yb : ma - mb
      })
      .map(([mes, combs]) => {
        const entry: Record<string, any> = { mes }
        Object.entries(combs).forEach(([c, d]) => { entry[c] = parseFloat((d.soma / d.qtd).toFixed(3)) })
        return entry
      })

    return { porPostoComb, evolucao, alertas: alertas.sort((a, b) => b.diff - a.diff).slice(0, 20) }
  }, [extratos])

  const combustiveis = Array.from(new Set(porPostoComb.map(p => p.combustivel)))
  const cores = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626']

  return (
    <div className="preco-comb">
      {alertas.length > 0 && (
        <div className="alerta-secao" style={{ marginBottom: '1.5rem' }}>
          <div className="alerta-header alerta-amarelo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Preços acima de 10% da média — {alertas.length} ocorrências
          </div>
          <table className="tabela tabela-sm">
            <thead><tr><th>Data</th><th>Placa</th><th>Posto</th><th>Combustível</th><th>Preço cobrado</th><th>Média geral</th><th>Diferença</th></tr></thead>
            <tbody>
              {alertas.map((a, i) => (
                <tr key={i} className="tr-amarelo">
                  <td>{a.data}</td>
                  <td><code>{a.placa}</code></td>
                  <td>{a.posto}</td>
                  <td>{a.combustivel}</td>
                  <td>{fmt3(a.preco)}</td>
                  <td>{fmt3(a.mediaGeral)}</td>
                  <td><span className="badge-vermelho">+{a.diff.toFixed(1)}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="tabela-hist-wrap" style={{ marginBottom: '1.5rem' }}>
        <div className="grafico-titulo">Preço médio por litro por posto</div>
        <table className="tabela tabela-sm">
          <thead><tr><th>Posto</th><th>Combustível</th><th>Preço médio/L</th><th>Litros</th><th>Abastecimentos</th></tr></thead>
          <tbody>
            {porPostoComb.map((p, i) => (
              <tr key={i}>
                <td>{p.posto}</td>
                <td>{p.combustivel}</td>
                <td style={{ fontWeight: 500 }}>{fmt3(p.precoMedio)}</td>
                <td>{p.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L</td>
                <td>{p.qtd}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {evolucao.length > 1 && (
        <div className="grafico-card">
          <div className="grafico-titulo">Evolução do preço por litro ao longo do tempo</div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={evolucao} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `R$${v.toFixed(2)}`} domain={['auto', 'auto']} />
              <Tooltip formatter={(v: number) => fmt3(v)} />
              <Legend />
              {combustiveis.map((c, i) => (
                <Line key={c} type="monotone" dataKey={c} name={c} stroke={cores[i % cores.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
