'use client'
import { createContext, forwardRef, useContext, type ButtonHTMLAttributes, type HTMLAttributes } from 'react'
import { cn } from './cn'

type TabsVariant = 'underline' | 'pill'
const Ctx = createContext<TabsVariant>('underline')

function Root({ className, variant = 'underline', ...props }: HTMLAttributes<HTMLDivElement> & { variant?: TabsVariant }) {
    return (
        <Ctx.Provider value={variant}>
            <div
                role="tablist"
                className={cn(
                    'flex',
                    variant === 'underline'
                        ? 'relative items-center border-b border-neutral-200'
                        : 'gap-3 rounded-full border border-neutral-200 bg-neutral-100 p-1.5 max-desktop:gap-0 max-desktop:p-1',
                    className,
                )}
                {...props}
            />
        </Ctx.Provider>
    )
}

type ItemProps = ButtonHTMLAttributes<HTMLButtonElement> & { isActive?: boolean }

// 고른 탭: 밑줄형 = 굵은 검정 글씨 + 초록 밑줄, 알약형 = 흰 알약
const Item = forwardRef<HTMLButtonElement, ItemProps>(({ className, isActive = false, children, ...props }, ref) => {
    const variant = useContext(Ctx)
    return (
        <button
            ref={ref}
            role="tab"
            type="button"
            aria-selected={isActive}
            className={cn(
                'cursor-pointer font-semibold text-neutral-400 transition-colors hover:text-neutral-600',
                variant === 'underline'
                    ? 'relative inline-flex min-h-11 items-center justify-center gap-1 px-5 py-3 text-body-1'
                    : 'w-full whitespace-pre rounded-full px-3 py-2 text-body-1 max-desktop:px-2.5 max-desktop:py-1.5 max-desktop:text-body-3',
                isActive && (variant === 'underline' ? 'font-bold text-neutral-900' : 'bg-white font-bold text-neutral-900 hover:text-neutral-900'),
                className,
            )}
            {...props}
        >
            {children}
            {variant === 'underline' && isActive && <span aria-hidden className="absolute bottom-0 left-0 h-0.5 w-full bg-primary-500" />}
        </button>
    )
})
Item.displayName = 'TabsItem'

export const Tabs = Object.assign(Root, { Item })
