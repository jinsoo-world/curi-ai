'use client'
// 봇 답 말풍선 = 마크다운으로 그린다. 목록, 링크, 코드는 살리고, **굵게**는 일반 글자로 푼다.
//
// 왜 = 모델이 「**굵게**」를 많이 쓰면 AI 답처럼 보인다(대표 피드백).
// 접근 = ① 시스템 프롬프트에서 ** 사용 자제 ② 렌더에서 strong/b 를 굵게 그리지 않음
//        ③ 코드 블록은 그대로 둔다. 사람이 쓴 말풍선은 여기 안 태운다.

import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { stripMdBoldMarkers } from '@/domains/chat/markdown'

/** 살릴 태그. 제목, 표, 인용, 이미지는 껍데기만 벗기고 글자는 남긴다. strong/b 는 허용하되 굵게 그리지 않는다 */
const ALLOWED = ['p', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'a', 'br', 'code', 'pre', 'del']

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
                strong: ({ children }) => <>{children}</>,
                b: ({ children }) => <>{children}</>,
            }}
        >{stripMdBoldMarkers(text)}</Markdown>
    )
}
