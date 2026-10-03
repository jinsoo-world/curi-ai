import type { HTMLAttributes } from 'react'
import { cardClass } from './classes'

// 카드 = 흰 바탕 + neutral-200 테두리 + 16px 둥글기. 그림자 없음
export function Card({ interactive, selected, className, ...props }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean; selected?: boolean }) {
    return <div className={cardClass({ interactive, selected, className })} {...props} />
}
