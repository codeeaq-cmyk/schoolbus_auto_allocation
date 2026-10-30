import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md'
  /** Slides in from the side and keeps the page in view, for reviewing one item. */
  drawer?: boolean
}

const overlayClass = 'fixed inset-0 z-50 bg-night/45 backdrop-blur-[3px] data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out'

export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md', drawer }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={overlayClass} />
        <RadixDialog.Content
          className={cn(
            'fixed z-50 flex flex-col bg-surface focus:outline-none',
            drawer
              ? 'inset-y-0 right-0 w-full max-w-md data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out'
              : cn(
                  'left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] rounded-3xl data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out',
                  size === 'sm' ? 'max-w-md' : 'max-w-lg',
                ),
          )}
          // Radix expects an explicit opt-out when there is no description.
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="flex items-start gap-3 px-6 pb-2 pt-5">
            <div className="min-w-0 flex-1">
              <RadixDialog.Title className="text-lg font-extrabold tracking-tight text-ink">{title}</RadixDialog.Title>
              {description && <RadixDialog.Description className="mt-1 text-sm leading-relaxed text-ink-3">{description}</RadixDialog.Description>}
            </div>
            <RadixDialog.Close className="-mr-2 -mt-1 grid size-10 cursor-pointer place-items-center rounded-xl text-ink-3 transition-colors hover:bg-muted hover:text-ink" aria-label="Close">
              <X className="size-5" aria-hidden="true" />
            </RadixDialog.Close>
          </div>
          {children && <div className="scrollbar-soft flex-1 overflow-y-auto px-6 py-5">{children}</div>}
          {footer && <div className="flex flex-wrap justify-end gap-2 px-6 pb-5 pt-3">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
