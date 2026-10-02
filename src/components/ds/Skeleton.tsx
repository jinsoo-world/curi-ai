import type { HTMLAttributes } from 'react'
import { cn } from './cn'

// 로딩은 도는 점 대신 최종 모양을 지키는 Skeleton
export function Skeleton({ shape = 'rect', className, ...props }: HTMLAttributes<HTMLDivElement> & { shape?: 'line' | 'rect' | 'circle' }) {
    return <div aria-hidden className={cn('animate-pulse bg-neutral-100', shape === 'circle' ? 'rounded-full' : 'rounded', className)} {...props} />
}
