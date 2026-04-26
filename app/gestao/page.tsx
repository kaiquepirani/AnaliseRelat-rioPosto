'use client'
import { useEffect, useState } from 'react'
import TelaSenha from '@/components/contratos/TelaSenha'
import PainelGestao from '@/components/gestao/PainelGestao'

const STORAGE_KEY = 'contratos_session_token'

export default function GestaoPage() {
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
  return <PainelGestao token={token} onLogout={handleLogout} />
}
