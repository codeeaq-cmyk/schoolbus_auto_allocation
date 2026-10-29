import { cn } from '../../lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary shadow-sm hover:bg-primary-hover',
  secondary: 'border border-line bg-surface text-ink shadow-xs hover:border-line-strong hover:bg-muted',
  ghost: 'text-ink-2 hover:bg-muted hover:text-ink',
  danger: 'bg-danger text-white shadow-sm hover:bg-danger-hover',
  accent: 'bg-accent text-on-accent shadow-sm hover:bg-accent-hover',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
  icon: 'h-10 w-10',
}

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(
    'inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out active:scale-[0.98]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  )
}

export const inputClass = cn(
  'h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-3',
  'transition-[border-color,box-shadow] duration-150 hover:border-line-strong',
  'focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15',
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/15',
  'disabled:cursor-not-allowed disabled:bg-muted',
)
