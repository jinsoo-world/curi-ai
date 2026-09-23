'use client'
// 봇 답 말풍선 = 마크다운으로 그린다. 굵게, 목록, 링크만 살리고 나머지 서식은 글자로 푼다.
//
// 왜 = 모델이 「**굵게**」나 「- 목록」을 그대로 뱉으면 4060 손님 눈에는 그냥 깨진 글자다.
// 링크는 새 탭으로 열고 rel=noopener 를 붙인다(연 탭이 우리 화면을 건드리지 못하게).
// 사람이 쓴 말풍선은 그대로 글이다 — 여기 안 태운다.

import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** 살릴 태그. 여기 없는 것(제목, 표, 인용, 이미지)은 껍데기만 벗기고 글자는 남긴다 */
const ALLOWED = ['p', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'a', 'br', 'code', 'del']

export default function BotMarkdown({ text }: { text: string }) {
    return (
        <Markdown
            remarkPlugins={[remarkGfm]}
            allowedElements={ALLOWED}
            unwrapDisallowed
            components={{
                a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                ),
            }}
        >{text}</Markdown>
    )
}
