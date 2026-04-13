import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ETCO Frota — Gestão de Combustível',
  description: 'Dashboard de consumo de combustível da frota ETCO',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  themeColor: '#2D3A6B',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ETCO Frota" />
      </head>
      <body>{children}</body>
    </html>
  )
}
