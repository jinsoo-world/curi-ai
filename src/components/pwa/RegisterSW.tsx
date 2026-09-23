'use client'
// 서비스 워커(public/sw.js) 등록 = 「앱처럼 설치」의 필수 조건 하나.
// 배포(프로덕션)에서만 켠다. 개발 중에 켜면 옛 파일이 저장돼 화면이 안 바뀌는 것처럼 보인다.

import { useEffect } from 'react'

export default function RegisterSW() {
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') return
        if (!('serviceWorker' in navigator)) return
        const register = () => {
            navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* 안 되면 그냥 웹으로 쓴다 */ })
        }
        if (document.readyState === 'complete') register()
        else window.addEventListener('load', register, { once: true })
    }, [])
    return null
}
