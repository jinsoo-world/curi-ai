import type { HTMLAttributes } from 'react'
import { cn } from './cn'

// 구역 시작은 항상 SectionHeader. 넓은 화면 headline-2(24) / 좁은 화면 title-2(20)
function Root({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('flex flex-col gap-1', className)} {...props} />
}
function Title({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
    return <h2 className={cn('text-headline-2 font-bold text-neutral-900 max-desktop:text-title-2', className)} {...props} />
}
function Subtitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
    return <h3 className={cn('text-title-2 font-bold text-neutral-900 max-desktop:text-body-1', className)} {...props} />
}
function Description({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
    return <p className={cn('text-body-1 font-medium text-neutral-500 max-desktop:text-body-3', className)} {...props} />
}

export const SectionHeader = Object.assign(Root, { Title, Subtitle, Description })
