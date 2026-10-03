import type { HTMLAttributes, ReactNode } from 'react'
import { badgeClass, type BadgeSize, type BadgeVariant } from './classes'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?: BadgeVariant
    size?: BadgeSize
    children: ReactNode
}

// 상태 표시는 Badge, 안내 문구는 Callout. 섞어 쓰지 않는다
export function Badge({ variant, size, className, children, ...props }: BadgeProps) {
    return <span className={badgeClass(variant, size, className)} {...props}>{children}</span>
}
