import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { EASE_OUT, fadeIn, staggerList } from '../../lib/motion'

/** Cross-fades page content when the key changes. Quick enough never to feel like waiting. */
export function PageFade({ pageKey, children, className }: { pageKey: string; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pageKey}
        className={className}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.3, ease: EASE_OUT } }}
        exit={{ opacity: 0, transition: { duration: 0.1 } }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

/** Children marked with <StaggerItem> arrive one after another. */
export function Stagger({ children, className, as = 'div', inView }: { children: ReactNode; className?: string; as?: 'div' | 'ul' | 'ol' | 'dl'; inView?: boolean }) {
  const Component = motion[as]
  return (
    <Component
      className={className}
      variants={staggerList}
      initial="hidden"
      {...(inView ? { whileInView: 'show', viewport: { once: true, margin: '-60px' } } : { animate: 'show' })}
    >
      {children}
    </Component>
  )
}

export function StaggerItem({ children, className, as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'li' }) {
  const Component = motion[as]
  return (
    <Component className={className} variants={fadeIn}>
      {children}
    </Component>
  )
}

/** Fades content in as it scrolls into view. */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  )
}

/** A number that counts to its new value, so changes to the plan are visible. */
export function AnimatedNumber({ value, format, from }: { value: number; format: (n: number) => string; from?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const previous = useRef(from ?? value)
  const reduced = useReducedMotion()

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduced || previous.current === value) {
      el.textContent = format(value)
      previous.current = value
      return
    }
    const controls = animate(previous.current, value, {
      duration: 0.9,
      ease: EASE_OUT,
      onUpdate: (latest) => {
        el.textContent = format(latest)
      },
    })
    previous.current = value
    return () => controls.stop()
    // The formatter is a pure display choice; only a new value should restart the count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduced])

  return <span ref={ref}>{format(value)}</span>
}

const CONFETTI = ['#4f46e5', '#7c3aed', '#fbbf24', '#1baf7a', '#e87ba4', '#2a78d6']

/** A brief burst for a moment worth celebrating. Nothing moves if the user prefers less motion. */
export function ConfettiBurst() {
  const reduced = useReducedMotion()
  if (reduced) return null
  return (
    <div className="pointer-events-none absolute left-1/2 top-10 z-20" aria-hidden="true">
      {Array.from({ length: 22 }, (_, i) => {
        const angle = (i / 22) * Math.PI * 2
        const distance = 90 + (i % 5) * 26
        return (
          <motion.span
            key={i}
            className="absolute size-2 rounded-[3px]"
            style={{ background: CONFETTI[i % CONFETTI.length] }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.6, rotate: 0 }}
            animate={{ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance + 70, opacity: 0, scale: 1, rotate: 200 + i * 30 }}
            transition={{ duration: 1.3, ease: [0.2, 0.7, 0.3, 1] }}
          />
        )
      })}
    </div>
  )
}
