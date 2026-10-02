import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export type CalloutState = 'normal' | 'caution' | 'warning' | 'positive' | 'primary'

const BOX: Record<CalloutState, string> = {
    normal: 'border-neutral-200 bg-neutral-50',
    caution: 'border-amber-200 bg-amber-50',
    warning: 'border-red-200 bg-red-50',
    positive: 'border-blue-200 bg-blue-50',
    primary: 'border-primary-200 bg-primary-50',
}
const ACCENT: Record<CalloutState, string> = {
    normal: 'text-neutral-800',
    caution: 'text-amber-600',
    warning: 'text-red-600',
    positive: 'text-blue-600',
    primary: 'text-primary-600',
}

export type CalloutProps = Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'content'> & {
    state?: CalloutState
    title?: ReactNode
    content: ReactNode
    icon?: ReactNode
}

// 안내 문구 상자 (큐리어스 Callout)
export function Callout({ state = 'normal', title, content, icon, className, ...props }: CalloutProps) {
    return (
        <div className={cn('flex gap-2 rounded-lg border px-4 py-3', BOX[state], className)} {...props}>
            {icon && <span aria-hidden className={cn('mt-0.5 shrink-0', ACCENT[state])}>{icon}</span>}
            <div className="flex flex-1 flex-col gap-0.5">
                {title && <strong className={cn('text-body-1 font-semibold', ACCENT[state])}>{title}</strong>}
                <div className="text-label-1 font-medium text-neutral-600">{content}</div>
            </div>
        </div>
    )
}
