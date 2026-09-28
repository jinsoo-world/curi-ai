// 새 가입자 온보딩 (/os/start). 대표 승인 0928 23:15. 몸통은 StartBody(클라이언트).
import type { Metadata } from 'next'
import StartBody from './StartBody'

export const metadata: Metadata = {
    title: { absolute: '큐리AI | 시작하기' },
    robots: { index: false },
}

export default function StartPage() {
    return <StartBody />
}
