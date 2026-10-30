import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Input } from '../../components/ui/Field'
import { VehicleIcon } from '../../components/ui/VehicleChip'
import { VEHICLE_NAMES, VEHICLE_PRESETS } from '../../lib/engine/presets'
import { cn } from '../../lib/cn'
import type { Vehicle, VehicleType } from '../../lib/types'

export type VehicleFields = Pick<Vehicle, 'label' | 'plate' | 'type' | 'seats' | 'driverName' | 'driverPhone' | 'kmPerLitre' | 'maintenancePerKm' | 'crewMonthly' | 'standingMonthly'>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: VehicleFields
  mode: 'add' | 'edit'
  onSubmit: (fields: VehicleFields) => void
}

export function VehicleFormDialog({ open, onOpenChange, initial, mode, onSubmit }: Props) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'add' ? 'Add a vehicle' : `Edit ${initial.label}`}
      description={mode === 'add' ? 'That is all the system needs. It suggests a starting point, then plans boarding points and riders itself.' : 'Changes to seats, type or costs re-plan the routes.'}
    >
      {open && <VehicleForm key={initial.label} initial={initial} mode={mode} onCancel={() => onOpenChange(false)} onSubmit={onSubmit} />}
    </Dialog>
  )
}

function VehicleForm({ initial, mode, onCancel, onSubmit }: { initial: VehicleFields; mode: 'add' | 'edit'; onCancel: () => void; onSubmit: (f: VehicleFields) => void }) {
  const [type, setType] = useState<VehicleType>(initial.type)
  const [fields, setFields] = useState(() => ({
    label: initial.label,
    plate: initial.plate,
    driverName: initial.driverName,
    driverPhone: initial.driverPhone,
    seats: String(initial.seats),
    kmPerLitre: String(initial.kmPerLitre),
    maintenancePerKm: String(initial.maintenancePerKm),
    crewMonthly: String(initial.crewMonthly),
    standingMonthly: String(initial.standingMonthly),
  }))
  const [errors, setErrors] = useState<Partial<Record<keyof typeof fields, string>>>({})

  const set = (key: keyof typeof fields, value: string) => {
    setFields((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const choose = (next: VehicleType) => {
    setType(next)
    const preset = VEHICLE_PRESETS[next]
    // Switching type loads that type's typical figures, and its name if still the default.
    setFields((f) => ({
      ...f,
      label: mode === 'add' ? f.label.replace(/^(Bus|Van)/, VEHICLE_NAMES[next]) : f.label,
      seats: String(preset.seats),
      kmPerLitre: String(preset.kmPerLitre),
      maintenancePerKm: String(preset.maintenancePerKm),
      crewMonthly: String(preset.crewMonthly),
      standingMonthly: String(preset.standingMonthly),
    }))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const seats = Number(fields.seats)
    const found: typeof errors = {}
    if (!fields.label.trim()) found.label = 'Give it a name, such as "Van 03".'
    if (!Number.isInteger(seats) || seats < 1 || seats > 80) found.seats = 'Enter a whole number from 1 to 80.'
    if (!(Number(fields.kmPerLitre) > 0)) found.kmPerLitre = 'Must be above 0.'
    for (const key of ['maintenancePerKm', 'crewMonthly', 'standingMonthly'] as const) {
      if (!(Number(fields[key]) >= 0)) found[key] = 'Must be 0 or more.'
    }
    setErrors(found)
    const first = (Object.keys(found) as (keyof typeof fields)[])[0]
    if (first) {
      document.getElementById(`vehicle-${first}`)?.focus()
      return
    }
    onSubmit({
      type,
      label: fields.label.trim(),
      plate: fields.plate.trim().toUpperCase(),
      driverName: fields.driverName.trim() || 'To be assigned',
      driverPhone: fields.driverPhone.trim(),
      seats,
      kmPerLitre: Number(fields.kmPerLitre),
      maintenancePerKm: Number(fields.maintenancePerKm),
      crewMonthly: Number(fields.crewMonthly),
      standingMonthly: Number(fields.standingMonthly),
    })
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <fieldset>
        <legend className="text-sm font-semibold text-ink">Type</legend>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {(['bus', 'van'] as const).map((option) => (
            <label
              key={option}
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-2xl p-3.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                type === option ? 'gradient-primary text-white' : 'bg-muted text-ink hover:bg-tonal',
              )}
            >
              <input type="radio" name="vehicle-type" className="sr-only" checked={type === option} onChange={() => choose(option)} />
              <VehicleIcon type={option} className="mt-0.5 size-5 shrink-0" />
              <span>
                <span className="block text-sm font-bold">{VEHICLE_NAMES[option]}</span>
                <span className={cn('block text-xs', type === option ? 'text-white/90' : 'text-ink-3')}>{option === 'bus' ? 'Wide roads only. Cheapest per child when full.' : 'Fits narrow lanes. Fewer seats.'}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="vehicle-label" label="Name" required error={errors.label}>
          {(p) => <Input {...p} value={fields.label} onChange={(e) => set('label', e.target.value)} />}
        </Field>
        <Field id="vehicle-seats" label="Seats for children" required error={errors.seats} hint="Leave out the driver and attendant.">
          {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={80} value={fields.seats} onChange={(e) => set('seats', e.target.value)} />}
        </Field>
        <Field id="vehicle-plate" label="Registration" hint="Optional">
          {(p) => <Input {...p} value={fields.plate} onChange={(e) => set('plate', e.target.value)} placeholder="KL 01 AB 0000" />}
        </Field>
        <Field id="vehicle-driverName" label="Driver" hint="Optional">
          {(p) => <Input {...p} value={fields.driverName} onChange={(e) => set('driverName', e.target.value)} autoComplete="off" />}
        </Field>
        <Field id="vehicle-driverPhone" label="Driver phone" hint="Shown to parents" className="sm:col-span-2">
          {(p) => <Input {...p} type="tel" value={fields.driverPhone} onChange={(e) => set('driverPhone', e.target.value)} autoComplete="off" />}
        </Field>
      </div>

      <details className="rounded-2xl bg-muted px-3.5 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink">Running costs (sample figures)</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field id="vehicle-kmPerLitre" label="Km per litre" error={errors.kmPerLitre}>
            {(p) => <Input {...p} type="number" step="0.1" min={0} value={fields.kmPerLitre} onChange={(e) => set('kmPerLitre', e.target.value)} />}
          </Field>
          <Field id="vehicle-maintenancePerKm" label="Upkeep per km (₹)" error={errors.maintenancePerKm}>
            {(p) => <Input {...p} type="number" step="0.5" min={0} value={fields.maintenancePerKm} onChange={(e) => set('maintenancePerKm', e.target.value)} />}
          </Field>
          <Field id="vehicle-crewMonthly" label="Crew pay a month (₹)" error={errors.crewMonthly} hint="Saved if the vehicle is benched">
            {(p) => <Input {...p} type="number" step="500" min={0} value={fields.crewMonthly} onChange={(e) => set('crewMonthly', e.target.value)} />}
          </Field>
          <Field id="vehicle-standingMonthly" label="Fixed costs a month (₹)" error={errors.standingMonthly} hint="Insurance, tax, permit, loan">
            {(p) => <Input {...p} type="number" step="500" min={0} value={fields.standingMonthly} onChange={(e) => set('standingMonthly', e.target.value)} />}
          </Field>
        </div>
      </details>

      <div className="mt-1 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{mode === 'add' ? 'Add and re-plan' : 'Save changes'}</Button>
      </div>
    </form>
  )
}
