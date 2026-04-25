'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import type { Contrato, ContratoComAlerta, ItemContrato } from '@/lib/contratos-types'
import {
  calcularSituacao, itensVigentes, valorTotalAtual,
  rotuloAditamentoAtual, rotuloTipoAditamento, corTipoAditamento,
} from '@/lib/contratos-types'
import FormularioContrato from './FormularioContrato'
import PreviaImportacao from './PreviaImportacao'
import ResumoContratos from './ResumoContratos'
import FaturamentoPainel from './FaturamentoPainel'

interface Props {
  token: string
  onLogout: () => void
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

type Aba = 'resumo' | 'contratos' | 'faturamento'
type FiltroSituacao = 'ativos' | 'todos' | 'vigente' | 'vencendo' | 'vencido' | 'encerrado' | 'em_renovacao'

export default function PainelContratos({ token, onLogout }: Props) {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('resumo')
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroSituacao, setFiltroSituacao] = useState<FiltroSituacao>('ativos')
  const [filtroCidade, setFiltroCidade] = useState<string>('')
  const [busca, setBusca] = useState('')
  const [formAberto, setFormAberto] = useState(false)
  const [emEdicao, setEmEdicao] = useState<Contrato | null>(null)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [importando, setImportando] = useState(false)
  const [statusImport, setStatusImport] = useState<string>('')
  const [previaDados, setPreviaDados] = useState<any>(null)
  const inputImportRef = useRef<HTMLInputElement>(null)

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
    () => contratos.map(
