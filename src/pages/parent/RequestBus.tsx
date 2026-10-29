import { ArrowLeft, Crosshair, Hand, LoaderCircle, LocateFixed, MapPinned, Search, Send } from 'lucide-react'
import type { Marker as LeafletMarker } from 'leaflet'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Marker, Polyline } from 'react-leaflet'
import { BaseMap, FitBounds, FlyTo, MapClick } from '../../components/map/BaseMap'
import { homeIcon, pickupIcon } from '../../components/map/icons'
import { CoverageLayer, RouteLine, SchoolMarker, StopMarkers } from '../../components/map/layers'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Field, Input, Select } from '../../components/ui/Field'
import { EmptyState } from '../../components/ui/misc'
import { useToast } from '../../components/ui/toast-context'
import { computeAssignments, networkBounds } from '../../lib/assign'
import { routeColor } from '../../lib/colors'
import { cn } from '../../lib/cn'
import { GRADES } from '../../lib/constants'
import { formatDistance, haversine } from '../../lib/geo'
import { href, navigate } from '../../lib/router'
import { reverseGeocode, searchPlaces, type Place } from '../../lib/services'
import type { LatLng, Student } from '../../lib/types'
import { useStore } from '../../store/context'
import { DEMO_PARENT, uid } from '../../store/state'
import { AssignmentDetails, StatusBadge } from './AssignmentDetails'

type FormKey = 'name' | 'grade' | 'parentName' | 'parentPhone' | 'home'
type Errors = Partial<Record<FormKey, string>>

function validate(form: { name: string; grade: string; parentName: string; parentPhone: string }, home: LatLng | null): Errors {
  const errors: Errors = {}
  if (form.name.trim().length < 2) errors.name = "Enter your child's full name."
  if (!form.grade) errors.grade = 'Choose a class.'
  if (form.parentName.trim().length < 2) errors.parentName = 'Enter your name.'
  if (form.parentPhone.replace(/\D/g, '').length < 10) errors.parentPhone = 'Enter a phone number with at least 10 digits.'
  if (!home) errors.home = 'Drop a pin at your home on the map.'
  return errors
}

export function RequestBus({ editId }: { editId: string | null }) {
  const { state, dispatch, result: current } = useStore()
  const toast = useToast()
  const editing = editId ? state.students.find((s) => s.id === editId && s.parentId === DEMO_PARENT.id) : undefined

  const [form, setForm] = useState({
    name: editing?.name ?? '',
    grade: editing?.grade ?? '',
    parentName: editing?.parentName ?? DEMO_PARENT.name,
    parentPhone: editing?.parentPhone ?? DEMO_PARENT.phone,
  })
  const [home, setHome] = useState<LatLng | null>(editing?.home ?? null)
  const [address, setAddress] = useState(editing?.address ?? '')
  const [addressEdited, setAddressEdited] = useState(Boolean(editing))
  const [lookingUp, setLookingUp] = useState(false)
  const [flyTarget, setFlyTarget] = useState<LatLng | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)
  const geocodeAbort = useRef<AbortController | null>(null)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)

  const update = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const placeHome = (p: LatLng, knownAddress?: string) => {
    setHome(p)
    if (errors.home) setErrors((e) => ({ ...e, home: undefined }))
    if (knownAddress) {
      setAddress(knownAddress)
      setAddressEdited(false)
      return
    }
    if (addressEdited) return
    geocodeAbort.current?.abort()
    const controller = new AbortController()
    geocodeAbort.current = controller
    setLookingUp(true)
    reverseGeocode(p, controller.signal).then((label) => {
      if (controller.signal.aborted) return
      setLookingUp(false)
      if (label) setAddress(label)
    })
  }

  const runSearch = async () => {
    if (query.trim().length < 3) {
      setSearchError('Type at least 3 characters.')
      return
    }
    setSearching(true)
    setSearchError(null)
    try {
      const results = await searchPlaces(query.trim(), state.settings.location)
      setPlaces(results)
      if (results.length === 0) setSearchError('No matches. Try a landmark or area name, or tap the map.')
    } catch {
      setSearchError("Address search isn't reachable right now. Tap the map to place your pin instead.")
      setPlaces(null)
    } finally {
      setSearching(false)
    }
  }

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setSearchError("This browser can't share its location. Tap the map instead.")
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        placeHome(p)
        setFlyTarget(p)
        const km = haversine(p, state.settings.location) / 1000
        if (km > 30) toast({ tone: 'info', title: `You're ${Math.round(km)} km from school`, description: 'The demo routes are in Bengaluru, so this spot will show as outside bus coverage.' })
      },
      () => {
        setLocating(false)
        setSearchError('Location permission was denied. Search for your address or tap the map.')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  // Live preview: run the real assignment engine with this child added as the newest request.
  const preview = useMemo(() => {
    if (!home) return null
    const draft: Student = {
      id: editing?.id ?? 'draft',
      name: form.name.trim() || 'Your child',
      grade: form.grade,
      parentId: DEMO_PARENT.id,
      parentName: form.parentName,
      parentPhone: form.parentPhone,
      home,
      address,
      registeredAt: editing?.registeredAt ?? Number.MAX_SAFE_INTEGER,
      manualBusId: editing?.manualBusId ?? null,
    }
    const others = state.students.filter((s) => s.id !== draft.id)
    const result = computeAssignments({ ...state, students: others }, [draft])
    return { draft, result, assignment: result.byStudent.get(draft.id)! }
  }, [home, form, address, editing, state])

  const routes = [...(preview?.result.routes ?? current.routes).values()]
  const assigned = preview?.assignment.status === 'assigned' ? preview.assignment : null
  const focusBusId = assigned?.busId ?? (preview?.assignment.status === 'waitlisted' ? preview.assignment.nearestBusId : null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found = validate(form, home)
    setErrors(found)
    const first = (['name', 'grade', 'parentName', 'parentPhone', 'home'] as const).find((k) => found[k])
    if (first) {
      document.getElementById(`field-${first}`)?.focus()
      return
    }
    setSubmitting(true)
    // A short beat so the parent sees the match happen rather than an instant jump.
    window.setTimeout(() => {
      const payload = {
        name: form.name.trim(),
        grade: form.grade,
        parentName: form.parentName.trim(),
        parentPhone: form.parentPhone.trim(),
        home: home!,
        address: address.trim() || 'Pinned on map',
      }
      const id = editing?.id ?? uid('stu')
      if (editing) dispatch({ type: 'student/update', id, patch: payload })
      else dispatch({ type: 'student/add', student: { id, parentId: DEMO_PARENT.id, registeredAt: Date.now(), manualBusId: null, ...payload } })
      const bus = assigned ? state.buses.find((b) => b.id === assigned.busId) : undefined
      toast(
        bus
          ? { tone: 'success', title: `${payload.name.split(' ')[0]} is on ${bus.label}`, description: 'The seat is confirmed and the school can see it.' }
          : { tone: 'warning', title: 'Added to the waitlist', description: "You'll be seated automatically when a seat opens." },
      )
      navigate(`/parent/child/${id}?new=1`)
    }, 650)
  }

  if (editId && !editing) {
    return (
      <EmptyState icon={<MapPinned />} title="This request isn't available" action={<ButtonLink href={href('/parent')}>Back to my children</ButtonLink>}>
        It may have been cancelled, or the demo data was reset.
      </EmptyState>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(380px,460px)_1fr]">
      {/* Map: top on mobile, right side on desktop. */}
      <div className="relative order-first h-[46vh] min-h-[320px] border-b border-line lg:order-none lg:col-start-2 lg:row-start-1 lg:h-auto lg:border-b-0 lg:border-l">
        <BaseMap center={state.settings.location} zoom={13} label="Pick your home location. Click or tap the map to drop a pin, then drag it to adjust.">
          <FitBounds points={editing ? [editing.home, state.settings.location] : networkBounds(state, routes)} fitKey="request" />
          <FlyTo target={flyTarget} />
          <MapClick onClick={(p) => placeHome(p)} />
          <CoverageLayer routes={routes} meters={state.settings.maxWalkMeters} />
          {routes.map((route) => (
            <RouteLine key={route.bus.id} route={route} emphasis={!focusBusId ? 'normal' : route.bus.id === focusBusId ? 'focus' : 'dim'} />
          ))}
          {routes.map((route) => (
            <StopMarkers key={route.bus.id} route={route} settings={state.settings} dim={!!focusBusId && route.bus.id !== focusBusId} />
          ))}
          <SchoolMarker position={state.settings.location} name={state.settings.name} />
          {home && assigned && (
            <>
              <Polyline positions={[home, assigned.pickup]} pathOptions={{ color: '#1e1b4b', weight: 2.5, dashArray: '4 6', interactive: false }} />
              <Marker position={assigned.pickup} icon={pickupIcon(routeColor(state.buses.find((b) => b.id === assigned.busId)!.colorSlot))} keyboard={false} />
            </>
          )}
          {home && (
            <Marker
              position={home}
              icon={homeIcon(true)}
              draggable
              zIndexOffset={800}
              eventHandlers={{
                dragend: (e) => {
                  const ll = (e.target as LeafletMarker).getLatLng()
                  placeHome({ lat: ll.lat, lng: ll.lng })
                },
              }}
              title="Your home. Drag to adjust."
            />
          )}
        </BaseMap>

        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center">
          <div className="flex items-center gap-2 rounded-full bg-ink/90 px-3.5 py-2 text-xs font-semibold text-white shadow-float">
            {home ? <Hand className="size-4" aria-hidden="true" /> : <Crosshair className="size-4" aria-hidden="true" />}
            {home ? 'Drag the pin to your exact gate' : 'Tap the map where you live'}
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-xl bg-surface/95 px-3 py-2 text-xs font-medium text-ink-2 shadow-card">
          <span className="h-3 w-5 rounded-sm bg-primary/25 ring-1 ring-primary/30" aria-hidden="true" />
          Within {formatDistance(state.settings.maxWalkMeters)} of a bus route
        </div>
      </div>

      <form onSubmit={submit} noValidate className="flex flex-col lg:col-start-1 lg:row-start-1 lg:min-h-0">
        <div className="flex-1 px-4 py-6 sm:px-6 lg:overflow-y-auto">
          <a href={href('/parent')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-3 hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden="true" />
            My children
          </a>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-ink">{editing ? 'Update home location' : 'Request a bus seat'}</h1>
          <p className="mt-1 text-[15px] text-ink-2">
            {editing ? `Move the pin and ${editing.name.split(' ')[0]}'s bus is re-matched instantly.` : "Tell us who's riding and where they live. We'll match the bus for you."}
          </p>

          <fieldset className="mt-6">
            <legend className="text-xs font-bold uppercase tracking-wider text-ink-3">1 · Child</legend>
            <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_150px]">
              <Field id="field-name" label="Child's full name" required error={errors.name}>
                {(p) => <Input {...p} value={form.name} onChange={(e) => update('name', e.target.value)} autoComplete="off" placeholder="e.g. Aarav Nair" />}
              </Field>
              <Field id="field-grade" label="Class" required error={errors.grade}>
                {(p) => (
                  <Select {...p} value={form.grade} onChange={(e) => update('grade', e.target.value)}>
                    <option value="">Choose…</option>
                    {GRADES.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field id="field-parentName" label="Parent name" required error={errors.parentName}>
                {(p) => <Input {...p} value={form.parentName} onChange={(e) => update('parentName', e.target.value)} autoComplete="name" />}
              </Field>
              <Field id="field-parentPhone" label="Phone" required error={errors.parentPhone}>
                {(p) => <Input {...p} type="tel" inputMode="tel" value={form.parentPhone} onChange={(e) => update('parentPhone', e.target.value)} autoComplete="tel" />}
              </Field>
            </div>
          </fieldset>

          <fieldset className="mt-7">
            <legend className="text-xs font-bold uppercase tracking-wider text-ink-3">2 · Home location</legend>
            <div className="mt-3 flex flex-col gap-3">
              <div role="search" className="flex flex-col gap-2">
                <label htmlFor="place-search" className="text-sm font-semibold text-ink">
                  Find your address
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
                    <Input
                      id="place-search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          // Search instead of submitting the whole request.
                          e.preventDefault()
                          runSearch()
                        }
                      }}
                      placeholder="Area, street or landmark"
                      className="pl-9"
                      autoComplete="off"
                    />
                  </div>
                  <Button variant="secondary" onClick={() => runSearch()} disabled={searching} aria-label="Search address">
                    {searching ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
                    <span className="hidden sm:inline">Search</span>
                  </Button>
                </div>
                {searchError && <p className="text-sm text-warning-ink">{searchError}</p>}
                {places && places.length > 0 && (
                  <ul className="overflow-hidden rounded-xl border border-line" aria-label="Search results">
                    {places.map((place) => (
                      <li key={place.id} className="border-b border-line last:border-0">
                        <button
                          type="button"
                          className="flex w-full cursor-pointer flex-col items-start px-3.5 py-2.5 text-left transition-colors hover:bg-primary-soft focus-visible:bg-primary-soft"
                          onClick={() => {
                            placeHome(place.position, [place.label, place.detail].filter(Boolean).join(', '))
                            setFlyTarget(place.position)
                            setPlaces(null)
                          }}
                        >
                          <span className="text-sm font-semibold text-ink">{place.label}</span>
                          <span className="text-xs text-ink-3">{place.detail}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Button variant="secondary" onClick={useMyLocation} disabled={locating} className="self-start">
                {locating ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <LocateFixed className="size-4" aria-hidden="true" />}
                Use my current location
              </Button>

              <div
                id="field-home"
                tabIndex={-1}
                className={cn(
                  'rounded-xl border px-3.5 py-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  errors.home ? 'border-danger bg-danger-soft text-danger-ink' : home ? 'border-line bg-muted text-ink-2' : 'border-dashed border-line-strong text-ink-3',
                )}
              >
                {errors.home ??
                  (home ? (
                    <span className="flex items-center gap-2">
                      <MapPinned className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      Pin placed at {home.lat.toFixed(5)}, {home.lng.toFixed(5)}
                    </span>
                  ) : (
                    'No pin yet. Tap the map, search above, or use your current location.'
                  ))}
              </div>

              <Field label="Address / landmark" hint={lookingUp ? 'Looking up the address…' : 'Filled in from the pin. Add a flat number or landmark for the driver.'}>
                {(p) => (
                  <Input
                    {...p}
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value)
                      setAddressEdited(true)
                    }}
                    placeholder="House no., street, landmark"
                  />
                )}
              </Field>
            </div>
          </fieldset>

          <section aria-labelledby="preview-heading" aria-live="polite" className="mt-7">
            <h2 id="preview-heading" className="text-xs font-bold uppercase tracking-wider text-ink-3">
              3 · Bus match preview
            </h2>
            <div className="mt-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
              {preview ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-ink">{preview.assignment.status === 'assigned' ? 'A seat is available' : 'No seat available here yet'}</p>
                    <StatusBadge assignment={preview.assignment} />
                  </div>
                  <AssignmentDetails
                    student={preview.draft}
                    assignment={preview.assignment}
                    result={preview.result}
                    students={[...state.students.filter((s) => s.id !== preview.draft.id), preview.draft]}
                    settings={state.settings}
                    compact
                  />
                </div>
              ) : (
                <p className="text-sm text-ink-3">Place your home pin to see which bus will pick your child up, and when.</p>
              )}
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 border-t border-line bg-surface/95 px-4 py-4 backdrop-blur sm:px-6">
          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                Matching your bus…
              </>
            ) : (
              <>
                <Send className="size-4" aria-hidden="true" />
                {editing ? 'Save new location' : preview?.assignment.status === 'waitlisted' ? 'Join the waitlist' : 'Confirm bus request'}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
