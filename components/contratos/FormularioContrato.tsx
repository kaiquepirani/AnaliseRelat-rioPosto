'use client'
import { useState, useRef } from 'react'
import type { Contrato, TipoServicoContrato, StatusContrato, Aditamento } from '@/lib/contratos-types'
import { TIPOS_SERVICO } from '@/lib/contratos-types'
import { abrirContratoPDF } from '@/lib/contratos-download'

interface Props {
  contrato: Contrato | null
  token: string
  onCancelar: () => void
  onSalvar: (dados: Partial<Contrato>) => Promise<void>
  onAtualizarLista: () => Promise<void>
}

interface DadosIA {
  cliente: string | null
  numero: string | null
  cidade: string | null
  tipoServico: TipoServicoContrato | null
  dataInicio: string | null
  dataVencimento: string | null
  valorMensal: number | null
  valorTotal: number | null
  objeto: string | null
}

interface DadosAditamentoIA {
  data: string | null
  novaDataVencimento: string | null
  novoValorMensal: number | null
  novoValorTotal: number | null
  observacoes: string | null
}

const fmtReal = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (iso: string | undefined) => {
  if (!iso) return '—'
  const p = iso.split('-')
  if (p.length !== 3) return iso
  return `${p[2]}/${p[1]}/${p[0]}`
}

export default function FormularioContrato({ contrato, token, onCancelar, onSalvar, onAtualizarLista }: Props) {
  const [numero, setNumero] = useState(contrato?.numero || '')
  const [cliente, setCliente] = useState(contrato?.cliente || '')
  const [tipoServico, setTipoServico] = useState<TipoServicoContrato>(contrato?.tipoServico || 'Transporte Escolar')
  const [cidade, setCidade] = useState(contrato?.cidade || '')
  const [dataInicio, setDataInicio] = useState(contrato?.dataInicio || '')
  const [dataVencimento, setDataVencimento] = useState(contrato?.dataVencimento || '')
  const [valorMensal, setValorMensal] = useState(contrato?.valorMensal != null ? String(contrato.valorMensal) : '')
  const [valorTotal, setValorTotal] = useState(contrato?.valorTotal != null ? String(contrato.valorTotal) : '')
  const [objeto, setObjeto] = useState(contrato?.objeto || '')
  const [observacoes, setObservacoes] = useState(contrato?.observacoes || '')
  const [status, setStatus] = useState<StatusContrato>(contrato?.status || 'vigente')
  const [arquivoUrl, setArquivoUrl] = useState(contrato?.arquivoUrl || '')
  const [arquivoNome, setArquivoNome] = useState(contrato?.arquivoNome || '')
  const [arquivoSize, setArquivoSize] = useState(contrato?.arquivoSize || 0)
  const [enviandoArquivo, setEnviandoArquivo] = useState(false)
  const [extraindo, setExtraindo] = useState(false)
  const [mensagemIA, setMensagemIA] = useState('')
  const [erroUpload, setErroUpload] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [camposIA, setCamposIA] = useState<Set<string>>(new Set())
  const [aditamentos, setAditamentos] = useState<Aditamento[]>(contrato?.aditamentos || [])
  const [adicionandoAditamento, setAdicionandoAditamento] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const marcarEdicaoManual = (nome: string) => {
    if (camposIA.has(nome)) {
      const novo = new Set(camposIA)
      novo.delete(nome)
      setCamposIA(novo)
    }
  }

  const aplicarDadosIA = (dados: DadosIA) => {
    const novos = new Set<string>()
    if (dados.cliente) { setCliente(dados.cliente); novos.add('cliente') }
    if (dados.numero) { setNumero(dados.numero); novos.add('numero') }
    if (dados.cidade) { setCidade(dados.cidade); novos.add('cidade') }
    if (dados.tipoServico) { setTipoServico(dados.tipoServico); novos.add('tipoServico') }
    if (dados.dataInicio) { setDataInicio(dados.dataInicio); novos.add('dataInicio') }
    if (dados.dataVencimento) { setDataVencimento(dados.dataVencimento); novos.add('dataVencimento') }
    if (dados.valorMensal != null) { setValorMensal(String(dados.valorMensal)); novos.add('valorMensal') }
    if (dados.valorTotal != null) { setValorTotal(String(dados.valorTotal)); novos.add('valorTotal') }
    if (dados.objeto) { setObjeto(dados.objeto); novos.add('objeto') }
    setCamposIA(novos)
  }

  const uploadArquivo = async (file: File) => {
    setErroUpload('')
    setMensagemIA('')
    setEnviandoArquivo(true)
    setExtraindo(true)

    const fdUp = new FormData(); fdUp.append('file', file)
    const fdEx = new FormData(); fdEx.append('f
