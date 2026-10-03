import type { ComponentProps, ReactNode } from 'react'
import { cn } from './cn'

// 모든 입력은 Field 로 감싸고 라벨·도움말·오류를 붙인다. placeholder 를 라벨 대신 쓰지 않는다
function FieldRoot({ className, ...props }: ComponentProps<'div'>) {
    return <div className={cn('flex w-full flex-col gap-1.5', className)} {...props} />
}
function FieldLabel({ className, ...props }: ComponentProps<'label'>) {
    return <label className={cn('text-label-1 font-semibold text-neutral-900', className)} {...props} />
}
function FieldHelperText({ className, ...props }: ComponentProps<'p'>) {
    return <p className={cn('text-label-2 text-neutral-500', className)} {...props} />
}
function FieldError({ className, children, ...props }: ComponentProps<'p'> & { children: ReactNode }) {
    return <p role="alert" className={cn('text-label-2 text-red-500', className)} {...props}>{children}</p>
}

export const Field = Object.assign(FieldRoot, { Label: FieldLabel, HelperText: FieldHelperText, Error: FieldError })
