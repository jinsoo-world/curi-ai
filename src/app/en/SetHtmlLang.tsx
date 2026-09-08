'use client'

import { useEffect } from 'react'

// 루트 layout 이 <html lang="ko"> 로 고정돼 있다.
// 영어 화면만 다른 lang 을 내려면 라우트 그룹으로 루트를 쪼개야 하는데,
// 고객이 쓰는 라이브 서비스라 그 큰 수술은 하지 않았다.
// 대신 화면이 뜨는 순간 문서 언어를 en 으로 바꿔 화면읽기 프로그램이 영어로 읽게 한다.
// ⚠️ 한계 = 검색엔진이 받는 첫 HTML 은 여전히 lang="ko" 다. 언어 신호는 hreflang 이 담당한다.
export default function SetHtmlLang({ lang }: { lang: string }) {
    useEffect(() => {
        const el = document.documentElement
        const before = el.lang
        el.lang = lang
        return () => {
            el.lang = before
        }
    }, [lang])

    return null
}
