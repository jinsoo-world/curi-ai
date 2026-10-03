import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from './cn'
import { INPUT_CLASS, inputWrapClass } from './classes'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
    error?: boolean
    startElement?: ReactNode
    endElement?: ReactNode
    wrapClassName?: string
}

// 큐리어스 Input: 흰 바탕 + neutral-200 테두리 + 누르면 초록 테두리. 오류일 때만 빨강
export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className, wrapClassName, error, disabled, startElement, endElement, ...props }, ref) => (
        <div className={inputWrapClass({ error, disabled, className: wrapClassName })}>
            {startElement}
            <input ref={ref} className={cn(INPUT_CLASS, className)} disabled={disabled} aria-invalid={error || undefined} {...props} />
            {endElement}
        </div>
    ),
)
Input.displayName = 'Input'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, error, ...props }, ref) => (
        <textarea
            ref={ref}
            aria-invalid={error || undefined}
            className={cn(
                'w-full resize-y rounded-lg border bg-white px-4 py-3 text-body-3 font-medium text-neutral-900 outline-none transition-colors placeholder:text-neutral-400 disabled:cursor-not-allowed disabled:bg-neutral-100',
                error ? 'border-red-500' : 'border-neutral-200 focus:border-primary-500',
                className,
            )}
            {...props}
        />
    ),
)
Textarea.displayName = 'Textarea'
