import { cn } from '../../lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'night'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const variants: Record<ButtonVariant, string> = {
  primary: 'gradient-primary text-on-primary hover:brightness-110',
  secondary: 'bg-tonal text-ink hover:bg-tonal-hover',
  ghost: 'text-ink-2 hover:bg-muted hover:text-ink',
  danger: 'bg-danger text-white hover:bg-danger-hover',
  accent: 'gradient-amber text-on-accent hover:brightness-105',
  night: 'bg-white/10 text-white hover:bg-white/20',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-5 text-[15px]',
  icon: 'h-10 w-10',
}

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return cn(
    'inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold',
    'transition-[background-color,color,transform,filter] duration-150 ease-out active:scale-[0.97]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  )
}

export const inputClass = cn(
  'h-11 w-full rounded-xl bg-surface px-3.5 text-[15px] text-ink ring-1 ring-inset ring-line placeholder:text-ink-3',
  'transition-[box-shadow] duration-150 hover:ring-line-strong',
  'focus:outline-none focus:ring-2 focus:ring-primary',
  'aria-[invalid=true]:ring-danger aria-[invalid=true]:focus:ring-danger',
  'disabled:cursor-not-allowed disabled:bg-muted',
)
