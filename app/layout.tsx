import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ETCO Frota — Gestão de Combustível',
  description: 'Dashboard de consumo de combustível da frota ETCO',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
