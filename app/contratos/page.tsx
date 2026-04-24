'use client'
import { useEffect, useState } from 'react'
import TelaSenha from '@/components/contratos/TelaSenha'
import PainelContratos from '@/components/contratos/PainelContratos'

const STORAGE_KEY = 'contratos_session_token'

export default function ContratosPage() {
  const [token, setToken] = useState<string | null>(null)
  const [verificado, setVerificado] = useState(false)

  useEffect(() => {
    const salvo = typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null
    if (salvo) setToken(salvo)
    setVerificado(true)
  }, [])

  const handleLogin = (novoToken: string) => {
    sessionStorage.setItem(STORAGE_KEY, novoToken)
    setToken(novoToken)
  }

  const handleLogout = () => {
    sessionStorage.removeItem(STORAGE_KEY)
    setToken(null)
  }

  if (!verificado) return null
  if (!token) return <TelaSenha onLogin={handleLogin} />
  return <PainelContratos token={token} onLogout={handleLogout} />
}
