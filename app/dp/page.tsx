'use client'
import { useState, useRef } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import CadastroColaboradores from '@/components/dp/CadastroColaboradores'
import ControlePagamentos from '@/components/dp/ControlePagamentos'
import { Colaborador, Cidade } from '@/lib/dp-types'

type Aba = 'pagamentos' | 'colaboradores'

const MAPA_CIDADES: Record<string, Cidade> = {
  'FOLHA AGUAS':        'Águas de Lindóia (Folha)',
  'ÁGUAS (FOLHA)':      'Águas de Lindóia (Folha)',
  'AGUAS (FOLHA)':      'Águas de Lindóia (Folha)',
  'DIÁRIAS ÁGUAS':      'Águas de Lindóia (Diárias)',
  'ÁGUAS (DIÁRIAS)':    'Águas de Lindóia (Diárias)',
  'AGUAS (DIARIAS)':    'Águas de Lindóia (Diárias)',
  'MORUNGABA':          'Morungaba',
  'MOGI MIRIM':         'Mogi Mirim',
  'ITAPIRA (ESCOLAR)':  'Itapira (Escolar)',
  'ITAPIRA (SAÚDE)':    'Itapira (Saúde)',
  'ITAPIRA (SAUDE)':    'Itapira (Saúde)',
  'AGUAÍ':              'Aguaí',
  'AGUAI':              'Aguaí',
  'CASA BRANCA':        'Casa Branca',
  'PINHAL':             'Pinhal',
  'UBATUBA':            'Ubatuba',
  'PORTO FERREIRA':     'Porto Ferreira',
  'LINDÓIA':            'Lindóia',
  'LINDOIA':            'Lindóia',
  'MOCOCA':             'Mococa',
  'RIO CLARO':          'Rio Claro',
}

interface ColaboradorImportado {
  nome: string
  cidade: Cidade
  totalReceber: number
  jaExiste: boolean
  colaboradorId?: string
}

interface ResultadoImportacao {
  colaboradores: ColaboradorImportado[]
  mesAno: string
  totalFolha: number
  erros: string[]
}

function extrairColaboradoresDaAba(dados: any[][], cidade: Cidade): ColaboradorImportado[] {
  const colaboradores: ColaboradorImportado[] = []
  let dentroResumo = false

  for (let i = 0; i < dados.length; i++) {
    const linha = dados[i]
    const textoLinha = linha.map((c: any) => String(c ?? '').trim()).join(' ')

    if (textoLinha.includes('RESUMO PAGAMENTO')) {
      dentroResumo = true
      continue
    }

    if (dentroResumo) {
      for (let j = 0; j < linha.length - 1; j++) {
        const cel = String(linha[j] ?? '').trim()
        if (/^\d+(\.0)?$/.test(cel) && parseInt(cel) >= 1 && parseInt(cel) <= 200) {
          const nome = String(linha[j + 1] ?? '').trim()
          const valor = parseFloat(String(linha[j + 2] ?? '').replace(',', '.'))
          if (nome && nome.length > 3 && !isNaN(valor) && valor > 0) {
            colaboradores.push({
              nome: nome.replace(/\s+/g, ' ').trim(),
              cidade,
              totalReceber: valor,
              jaExiste: false,
            })
          }
        }
      }
      if (textoLinha.includes('TOTAL') && !textoLinha.includes('RESUMO')) break
    }
  }

  return colaboradores
}

export default function DepartamentoPessoal() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('pagamentos')
  const [processando, setProcessando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [importando, setImportando] = useState(false)
  const [erroImport, setErroImport] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const processarExcel = async (arquivo: File) => {
    setProcessando(true)
    setErroImport(null)
    setResultado(null)

    try {
      const buf = await arquivo.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })

      const colaboradores: ColaboradorImportado[] = []
      const erros: string[] = []

      const nomeArq = arquivo.name
      const matchMes = nomeArq.match(/^(\d{2})_/)
      const mes = matchMes ? parseInt(matchMes[1]) : new Date().getMonth() + 1
      const ano = new Date().getFullYear()
      const mesAno = `${ano}-${String(mes).padStart(2, '0')}`

      for (const nomeAba of wb.SheetNames) {
        const chave = nomeAba.trim().toUpperCase()
        const cidade = MAPA_CIDADES[chave]

        if (!cidade) {
          if (!['TOTAL GERAL DA FOLHA', 'TOTAL GERAL'].includes(chave)) {
            erros.push(`Aba "${nomeAba}" não reconhecida — ignorada`)
          }
          continue
        }

        const ws = wb.Sheets[nomeAba]
        const dados: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
        const colabs = extrairColaboradoresDaAba(dados, cidade)

        if (colabs.length === 0) {
          erros.push(`Aba "${nomeAba}" — nenhum colaborador encontrado no resumo`)
        }

        colaboradores.push(...colabs)
      }

      // Marca duplicatas
      const res = await fetch('/api/dp/colaboradores')
      const cadastrados: Colaborador[] = await res.json()

      const comStatus = colaboradores.map(c => {
        const existente = cadastrados.find(
          cad => cad.nome.toLowerCase().trim() === c.nome.toLowerCase().trim()
        )
        return { ...c, jaExiste: !!existente, colaboradorId: existente?.id }
      })

      setResultado({
        colaboradores: comStatus,
        mesAno,
        totalFolha: comStatus.reduce((s, c) => s + c.totalReceber, 0),
        erros,
      })
    } catch (e: any) {
      setErroImport('Erro ao processar o arquivo: ' + e.message)
    } finally {
      setProcessando(false)
    }
  }

  const confirmarImportacao = async () => {
    if (!resultado) return
    setImportando(true)
    const novos = resultado.colaboradores.filter(c => !c.jaExiste)
    const agora = new Date().toISOString()

    for (const c of novos) {
      const colab: Colaborador = {
        id: `colab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        nome: c.nome,
        cidade: c.cidade,
        funcao: 'Motorista',
        salarioBase: c.totalReceber,
        dataInicio: '',
        status: 'ativo',
        dadosBancarios: { banco: '' },
        createdAt: agora,
        updatedAt: agora,
      }
      await fetch('/api/dp/colaboradores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(colab),
      })
    }

    setResultado(null)
    setImportando(false)
    setReload(r => r + 1)
    setAbaAtiva('colaboradores')
  }

  const abas: { id: Aba; label: string; icon: string }[] = [
    { id: 'pagamentos',    label: 'Controle de Pagamentos', icon: '💰' },
    { id: 'colaboradores', label: 'Colaboradores',          icon: '👥' },
  ]

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <img src="/logo.png" alt="ETCO Tur" className="logo-img" />
            <div className="logo-divider" />
            <div className="logo-text">
              <div className="logo-title">Departamento Pessoal</div>
              <div className="logo-sub">Gestão de colaboradores</div>
            </div>
          </div>
          <div className="logo-nome-cursivo">ETCO Tur</div>
          <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/" style={{
              padding: '0.45rem 1rem', fontSize: 12, fontWeight: 700,
              background: 'rgba(255,255,255,0.15)', color: 'white',
              border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8,
              textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'inherit',
            }}>← Início</Link>
            <Link href="/dashboard" style={{
              padding: '0.45rem 1rem', fontSize: 12, fontWeight: 700,
              background: 'rgba(255,255,255,0.15)', color: 'white',
              border: '1px solid rgba(255,255,255,0.4)', borderRadius: 8,
              textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
              fontFamily: 'inherit',
            }}>⛽ Combustível</Link>

            {/* Botão upload folha */}
            <div
              className={`upload-area ${processando ? 'upload-processando' : ''}`}
              onClick={() => !processando && inputRef.current?.click()}
              style={{ cursor: processando ? 'not-allowed' : 'pointer' }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                hidden
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) { processarExcel(f); e.target.value = '' }
                }}
              />
              <span className="upload-texto">
                {processando ? (
                  <><span className="spinner" /> Processando folha...</>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Importar folha Excel
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="main">
        <div className="abas" style={{ marginBottom: '1.25rem' }}>
          {abas.map(aba => (
            <button
              key={aba.id}
              className={`aba ${abaAtiva === aba.id ? 'aba-ativa' : ''}`}
              onClick={() => setAbaAtiva(aba.id)}
            >
              {aba.icon} {aba.label}
            </button>
          ))}
        </div>

        {/* Erro de importação */}
        {erroImport && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '0.875rem 1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#dc2626' }}>⚠️ {erroImport}</span>
            <button onClick={() => setErroImport(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}>✕</button>
          </div>
        )}

        {/* Modal de prévia da importação */}
        {resultado && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <div style={{ background: 'white', borderRadius: 16, padding: '2rem', maxWidth: 700, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--navy)' }}>📊 Prévia da importação</div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
                    {resultado.colaboradores.length} colaboradores encontrados · {resultado.colaboradores.filter(c => !c.jaExiste).length} novos
                  </div>
                </div>
                <button onClick={() => setResultado(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-3)' }}>✕</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: '1.25rem' }}>
                <div style={{ background: 'var(--sky-light)', borderRadius: 10, padding: '0.875rem', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase' as const }}>Total folha</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{fmt(resultado.totalFolha)}</div>
                </div>
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '0.875rem', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase' as const }}>Novos</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a' }}>{resultado.colaboradores.filter(c => !c.jaExiste).length}</div>
                </div>
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '0.875rem', textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase' as const }}>Já cadastrados</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#d97706' }}>{resultado.colaboradores.filter(c => c.jaExiste).length}</div>
                </div>
              </div>

              {resultado.erros.length > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>⚠️ Avisos ({resultado.erros.length})</div>
                  {resultado.erros.map((e, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#92400e' }}>• {e}</div>
                  ))}
                </div>
              )}

              <table className="tabela tabela-sm" style={{ marginBottom: '1.25rem' }}>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Cidade</th>
                    <th style={{ textAlign: 'right' }}>A receber</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.colaboradores.map((c, i) => (
                    <tr key={i} style={{ background: c.jaExiste ? '#fffbeb' : undefined }}>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{c.nome}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{c.cidade}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(c.totalReceber)}</td>
                      <td>
                        {c.jaExiste
                          ? <span style={{ fontSize: 11, background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', borderRadius: 10, padding: '2px 7px', fontWeight: 600 }}>Já cadastrado</span>
                          : <span style={{ fontSize: 11, background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: 10, padding: '2px 7px', fontWeight: 600 }}>Novo</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: '1.25rem' }}>
                ℹ️ Apenas os colaboradores <strong>novos</strong> serão cadastrados. Os já existentes serão ignorados. Após importar, revise os dados bancários e salário base de cada um.
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setResultado(null)} style={{ padding: '0.55rem 1.1rem', fontSize: 13, background: 'white', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
                <button
                  onClick={confirmarImportacao}
                  disabled={importando || resultado.colaboradores.filter(c => !c.jaExiste).length === 0}
                  style={{
                    padding: '0.55rem 1.25rem', fontSize: 13, fontWeight: 700,
                    background: 'var(--navy)', color: 'white', border: 'none',
                    borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                    opacity: importando || resultado.colaboradores.filter(c => !c.jaExiste).length === 0 ? 0.6 : 1,
                  }}
                >
                  {importando ? 'Importando...' : `Importar ${resultado.colaboradores.filter(c => !c.jaExiste).length} colaboradores`}
                </button>
              </div>
            </div>
          </div>
        )}

        {abaAtiva === 'pagamentos'    && <ControlePagamentos key={reload} />}
        {abaAtiva === 'colaboradores' && <CadastroColaboradores key={reload} />}
      </main>
    </div>
  )
}
