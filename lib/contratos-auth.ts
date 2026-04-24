import crypto from 'crypto'
import { NextRequest } from 'next/server'

const SESSION_TTL_HOURS = 8

const getSecret = (): string => {
  const pwd = process.env.CONTRATOS_PASSWORD
  if (!pwd) throw new Error('CONTRATOS_PASSWORD não configurada')
  return process.env.CONTRATOS_SECRET || pwd + '_etco_contratos_v1'
}

export const validarSenha = (senha: string): boolean => {
  const esperada = process.env.CONTRATOS_PASSWORD
  if (!esperada) return false
  if (senha.length !== esperada.length) return false
  return crypto.timingSafeEqual(Buffer.from(senha), Buffer.from(esperada))
}

export const gerarToken = (): string => {
  const timestamp = Date.now()
  const signature = crypto.createHmac('sha256', getSecret()).update(String(timestamp)).digest('hex')
  return `${timestamp}.${signature}`
}

export const validarToken = (token: string | null | undefined): boolean => {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [tsStr, sig] = parts
  const ts = parseInt(tsStr, 10)
  if (isNaN(ts)) return false
  if (Date.now() - ts > SESSION_TTL_HOURS * 60 * 60 * 1000) return false
  const esperada = crypto.createHmac('sha256', getSecret()).update(tsStr).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperada))
  } catch {
    return false
  }
}

export const tokenDaRequest = (req: NextRequest): string | null => {
  const auth = req.headers.get('authorization')
  if (auth && auth.indexOf('Bearer ') === 0) return auth.slice(7)
  return null
}

export const requisicaoAutenticada = (req: NextRequest): boolean => {
  return validarToken(tokenDaRequest(req))
}
