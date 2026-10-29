import { createContext, useContext } from 'react'

export type ToastTone = 'success' | 'info' | 'warning'

export interface Toast {
  id: number
  tone: ToastTone
  title: string
  description?: string
}

export const ToastContext = createContext<((toast: Omit<Toast, 'id'>) => void) | null>(null)

export function useToast() {
  const push = useContext(ToastContext)
  if (!push) throw new Error('useToast must be used inside <ToastProvider>')
  return push
}
