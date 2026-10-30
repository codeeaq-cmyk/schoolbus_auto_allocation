import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { spring } from '../../lib/motion'
import { ToastContext, type Toast } from './toast-context'

const icons = {
  success: <CircleCheck className="size-5 text-success-bright" aria-hidden="true" />,
  info: <Info className="size-5 text-accent" aria-hidden="true" />,
  warning: <TriangleAlert className="size-5 text-warning" aria-hidden="true" />,
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId.current++
      setToasts((list) => [...list.slice(-2), { ...toast, id }])
      window.setTimeout(() => dismiss(id), 4500)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-24 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end lg:bottom-6"
        role="status"
        aria-live="polite"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, x: 24, transition: { duration: 0.14 } }}
              transition={spring}
              className="on-dark pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl bg-night p-4 text-white"
            >
              {icons[t.tone]}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">{t.title}</p>
                {t.description && <p className="mt-0.5 text-sm text-night-ink">{t.description}</p>}
              </div>
              <button type="button" onClick={() => dismiss(t.id)} className="-m-1 grid size-8 cursor-pointer place-items-center rounded-lg text-night-ink hover:bg-white/10 hover:text-white" aria-label="Dismiss notification">
                <X className="size-4" aria-hidden="true" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
