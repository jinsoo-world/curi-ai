'use client'
// 답 기다리는 동안: 봇 얼굴 옆 말풍선 안에 점 세 개가 통통 튄다 (카톡, 아이메시지 입력 중처럼).
// 화면에 상태 문구는 없다. 스크린 리더에만 「입력 중」을 알린다.

import type { ReactNode } from 'react'

interface Props {
    avatar?: ReactNode
    /** 스크린 리더용 이름 */
    name?: string
    className?: string
}

export default function TypingIndicator({ avatar, name, className }: Props) {
    const label = name ? `${name} 입력 중` : '입력 중'
    return (
        <div className={`os-typing-row${className ? ` ${className}` : ''}`} role="status" aria-label={label}>
            {avatar ? <span className="os-typing-avatar" aria-hidden="true">{avatar}</span> : null}
            <span className="os-typing-bubble" aria-hidden="true">
                <span className="os-typing-dot" />
                <span className="os-typing-dot" />
                <span className="os-typing-dot" />
            </span>
        </div>
    )
}
