// 큐리어스 본체(curious-frontend-next src/shared/ui) 규격을 그대로 옮긴 클래스 표.
// 화면 부품(.tsx)과 <Link> 같은 다른 태그가 같은 모양을 쓰도록 문자열로 꺼내 둔다.
import { cn } from './cn'

export type ButtonVariant = 'primaryFill' | 'primaryOutline' | 'grayFill' | 'grayOutline' | 'blackFill' | 'blueFill' | 'redFill'
export type ButtonSize = 'xsmall' | 'small' | 'medium' | 'large' | 'xlarge'

const BUTTON_BASE = 'inline-flex w-fit cursor-pointer items-center justify-center whitespace-pre rounded-lg transition-colors no-underline disabled:pointer-events-none aria-disabled:pointer-events-none'

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
    primaryFill: 'bg-primary-500 font-semibold text-white hover:bg-primary-600 active:bg-primary-700 disabled:bg-neutral-200 disabled:font-medium disabled:text-neutral-400',
    primaryOutline: 'border border-primary-500 bg-primary-50 font-semibold text-primary-500 hover:border-primary-700 hover:text-primary-700 active:bg-primary-100 disabled:border-neutral-400 disabled:bg-neutral-200 disabled:font-medium disabled:text-neutral-400',
    grayFill: 'bg-neutral-100 font-medium text-neutral-600 hover:bg-neutral-200 active:bg-neutral-300 disabled:bg-neutral-200 disabled:text-neutral-400',
    grayOutline: 'border border-neutral-200 bg-white font-medium text-neutral-700 hover:bg-neutral-100 active:border-neutral-300 active:bg-neutral-200 disabled:border-neutral-300 disabled:bg-neutral-100 disabled:text-neutral-400',
    blackFill: 'bg-neutral-900 font-semibold text-white hover:bg-neutral-600 active:bg-neutral-500 disabled:bg-neutral-200 disabled:font-medium disabled:text-neutral-400',
    blueFill: 'bg-blue-600 font-semibold text-white hover:bg-blue-700 disabled:bg-neutral-200 disabled:font-medium disabled:text-neutral-400',
    redFill: 'bg-red-500 font-semibold text-white hover:bg-red-700 disabled:bg-neutral-200 disabled:font-medium disabled:text-neutral-400',
}

// 큐리어스 btn-* 유틸리티와 같은 안쪽 여백·글자 크기. 중장년 손가락을 위해 높이 최소값을 붙인다(44px 이상)
const BUTTON_SIZE: Record<ButtonSize, string> = {
    xsmall: 'gap-1 px-2 py-1.5 text-label-2 min-h-9',
    small: 'gap-1 px-3 py-2 text-label-1 min-h-10',
    medium: 'gap-1 px-3 py-2.5 text-body-3 min-h-11',
    large: 'gap-1 p-3 text-body-1 min-h-12',
    xlarge: 'gap-1 px-3 py-3.5 text-title-2 min-h-14',
}

export function buttonClass(variant: ButtonVariant = 'primaryFill', size: ButtonSize = 'medium', className?: string): string {
    return cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className)
}

export type BadgeVariant = 'gray' | 'blue' | 'primary' | 'red' | 'amber' | 'darkGray' | 'grayOutline' | 'blueOutline' | 'primaryOutline' | 'redOutline' | 'amberOutline' | 'primaryFill' | 'redFill'
export type BadgeSize = 'small' | 'medium' | 'large'

const BADGE_VARIANT: Record<BadgeVariant, string> = {
    gray: 'bg-neutral-100 text-neutral-600',
    blue: 'bg-blue-50 text-blue-600',
    primary: 'bg-primary-50 text-primary-500',
    red: 'bg-red-50 text-red-500',
    amber: 'bg-amber-50 text-amber-500',
    darkGray: 'bg-neutral-300 text-white',
    grayOutline: 'border border-neutral-400 bg-neutral-100 text-neutral-600',
    blueOutline: 'border border-blue-500 bg-blue-50 text-blue-500',
    primaryOutline: 'border border-primary-500 bg-primary-50 text-primary-500',
    redOutline: 'border border-red-500 bg-red-50 text-red-500',
    amberOutline: 'border border-amber-500 bg-amber-50 text-amber-500',
    primaryFill: 'bg-primary-500 text-white',
    redFill: 'bg-red-500 text-white',
}
const BADGE_SIZE: Record<BadgeSize, string> = {
    small: 'px-1.5 py-0.5 text-caption-1',
    medium: 'px-2 py-1 text-label-2',
    large: 'px-3 py-2 text-label-1',
}

export function badgeClass(variant: BadgeVariant = 'gray', size: BadgeSize = 'small', className?: string): string {
    return cn('inline-flex h-fit w-fit items-center justify-center whitespace-pre rounded font-semibold', BADGE_VARIANT[variant], BADGE_SIZE[size], className)
}

// 입력칸 바깥 틀 (큐리어스 Input wrapper)
export function inputWrapClass(opts: { error?: boolean; disabled?: boolean; className?: string } = {}): string {
    return cn(
        'flex w-full items-center gap-2 rounded-lg border bg-white px-4 py-3 desktop:py-4 transition-colors',
        opts.error ? 'border-red-500 focus-within:border-red-500' : 'border-neutral-200 focus-within:border-primary-500',
        opts.disabled && 'cursor-not-allowed border-neutral-300 bg-neutral-100 text-neutral-400',
        opts.className,
    )
}
export const INPUT_CLASS = 'min-w-0 flex-1 bg-transparent font-medium text-body-3 desktop:text-body-1 text-neutral-900 outline-none placeholder:text-neutral-400 disabled:cursor-not-allowed disabled:text-neutral-500'

// 카드 = 흰 바탕 + 테두리 + 2xl(16px). 그림자 대신 테두리로 면을 나눈다
export function cardClass(opts: { interactive?: boolean; selected?: boolean; className?: string } = {}): string {
    return cn(
        'rounded-2xl border bg-white',
        opts.selected ? 'border-primary-500 ring-1 ring-primary-500' : 'border-neutral-200',
        opts.interactive && 'cursor-pointer transition-colors hover:border-neutral-400',
        opts.className,
    )
}
