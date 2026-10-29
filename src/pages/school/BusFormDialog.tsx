import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Input } from '../../components/ui/Field'
import type { Bus } from '../../lib/types'

export type BusFields = Pick<Bus, 'label' | 'plate' | 'capacity' | 'driverName' | 'driverPhone'>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: BusFields
  mode: 'add' | 'edit'
  onSubmit: (fields: BusFields) => void
}

export function BusFormDialog({ open, onOpenChange, initial, mode, onSubmit }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'add' ? 'Add a bus' : `Edit ${initial.label}`}
      description={mode === 'add' ? 'After saving, click on the map to draw its route.' : 'Seat changes re-balance assignments immediately.'}
    >
      {/* Keyed so the form resets each time the dialog opens. */}
      {open && <BusForm key={initial.label} initial={initial} mode={mode} onCancel={() => onOpenChange(false)} onSubmit={onSubmit} />}
    </Dialog>
  )
}

function BusForm({ initial, mode, onCancel, onSubmit }: { initial: BusFields; mode: 'add' | 'edit'; onCancel: () => void; onSubmit: (f: BusFields) => void }) {
  const [fields, setFields] = useState({ ...initial, capacity: String(initial.capacity) })
  const [errors, setErrors] = useState<Partial<Record<keyof BusFields, string>>>({})

  const set = (key: keyof BusFields, value: string) => {
    setFields((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const capacity = Number(fields.capacity)
    const found: typeof errors = {}
    if (!fields.label.trim()) found.label = 'Give the bus a name, e.g. "Bus 05".'
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 80) found.capacity = 'Enter a whole number from 1 to 80.'
    if (!fields.driverName.trim()) found.driverName = "Enter the driver's name."
    setErrors(found)
    const first = (['label', 'capacity', 'driverName'] as const).find((k) => found[k])
    if (first) {
      document.getElementById(`bus-${first}`)?.focus()
      return
    }
    onSubmit({
      label: fields.label.trim(),
      plate: fields.plate.trim().toUpperCase(),
      capacity,
      driverName: fields.driverName.trim(),
      driverPhone: fields.driverPhone.trim(),
    })
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="bus-label" label="Bus name" required error={errors.label}>
          {(p) => <Input {...p} value={fields.label} onChange={(e) => set('label', e.target.value)} autoFocus />}
        </Field>
        <Field id="bus-plate" label="Registration number" hint="Optional">
          {(p) => <Input {...p} value={fields.plate} onChange={(e) => set('plate', e.target.value)} placeholder="KA 01 F 0000" />}
        </Field>
      </div>
      <Field id="bus-capacity" label="Seats for students" required error={errors.capacity} hint="Children only. Leave out the driver and attendant.">
        {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={80} value={fields.capacity} onChange={(e) => set('capacity', e.target.value)} className="max-w-40" />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="bus-driverName" label="Driver name" required error={errors.driverName}>
          {(p) => <Input {...p} value={fields.driverName} onChange={(e) => set('driverName', e.target.value)} autoComplete="off" />}
        </Field>
        <Field id="bus-driverPhone" label="Driver phone" hint="Shown to parents">
          {(p) => <Input {...p} type="tel" value={fields.driverPhone} onChange={(e) => set('driverPhone', e.target.value)} autoComplete="off" />}
        </Field>
      </div>
      <div className="mt-2 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{mode === 'add' ? 'Add bus' : 'Save changes'}</Button>
      </div>
    </form>
  )
}
