import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { buttonClass, type ButtonSize, type ButtonVariant } from './classes'

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> & {
    variant?: ButtonVariant
    size?: ButtonSize
}

// 큐리어스 Button. 화면당 primaryFill 은 하나만. 폼 제출 = primaryFill + large + w-full
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, type = 'button', ...props }, ref) => (
        <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...props} />
    ),
)
Button.displayName = 'Button'
