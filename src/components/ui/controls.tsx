import { Minus, Plus } from 'lucide-react'
import { motion } from 'motion/react'
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { spring } from '../../lib/motion'

export function Stepper({ value, onChange, min, max, label }: { value: number; onChange: (v: number) => void; min: number; max: number; label: string }) {
  const btn = 'grid size-10 cursor-pointer place-items-center text-ink transition-colors hover:bg-tonal-hover active:scale-90 disabled:cursor-not-allowed disabled:opacity-40'
  return (
    <div className="flex items-center overflow-hidden rounded-xl bg-tonal" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Decrease ${label.toLowerCase()}`}>
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10)
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
        }}
        className="h-10 w-12 bg-transparent text-center text-base font-bold text-ink tabular [appearance:textfield] focus:outline-none focus-visible:bg-primary-soft [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`Increase ${label.toLowerCase()}`}>
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

interface SegmentedProps<T extends string> {
  options: { id: T; label: ReactNode }[]
  value: T
  onChange: (id: T) => void
  label: string
  className?: string
}

/** A pill that glides between options. Works as a group of toggle buttons. */
export function Segmented<T extends string>({ options, value, onChange, label, className }: SegmentedProps<T>) {
  const id = useId()
  return (
    <div className={cn('flex rounded-xl bg-tonal p-1', className)} role="group" aria-label={label}>
      {options.map((option) => {
        const selected = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
            className={cn('relative flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors', selected ? 'text-ink' : 'text-ink-3 hover:text-ink')}
          >
            {selected && <motion.span layoutId={`${id}-pill`} className="absolute inset-0 rounded-lg bg-surface" transition={spring} />}
            <span className="relative flex items-center gap-1.5">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

interface TabsProps<T extends string> {
  tabs: { id: T; label: ReactNode }[]
  value: T
  onChange: (id: T) => void
  label: string
  children: ReactNode
}

/** WAI-ARIA tabs with arrow-key navigation. */
export function Tabs<T extends string>({ tabs, value, onChange, label, children }: TabsProps<T>) {
  const base = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (index + delta + tabs.length) % tabs.length
    onChange(tabs[next].id)
    refs.current[next]?.focus()
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 px-5">
        {tabs.map((tab, i) => {
          const selected = tab.id === value
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn('relative flex h-11 cursor-pointer items-center gap-2 px-3 text-sm font-semibold transition-colors', selected ? 'text-primary' : 'text-ink-3 hover:text-ink')}
            >
              {tab.label}
              {selected && <motion.span layoutId={`${base}-underline`} className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" transition={spring} aria-hidden="true" />}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${value}`}>
        {children}
      </div>
    </div>
  )
}
