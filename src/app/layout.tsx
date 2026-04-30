import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '판매관리 시스템',
  description: '(주)한국에이원 / 금화 / (주)나성 매입·매출·마진 관리',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
