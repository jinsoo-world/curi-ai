'use client'
// 아래 고정 「AI 만들기」: 맨 위 입력칸으로 올라가 커서를 둔다

import { HOME_COPY } from '@/domains/home/copy'

export function focusHomeInput() {
    const sec = document.getElementById('make')
    sec?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const input = document.getElementById('hm-input') as HTMLInputElement | null
    window.setTimeout(() => input?.focus({ preventScroll: true }), 350)
}

export default function HomeStickyCta() {
    return (
        <div className="hm-sticky">
            <button type="button" className="hm-sticky-btn" onClick={focusHomeInput}>{HOME_COPY.sticky}</button>
        </div>
    )
}
