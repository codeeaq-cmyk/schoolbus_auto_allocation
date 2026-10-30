import type { Marker as LeafletMarker } from 'leaflet'
import { ArrowLeft, Crosshair, Hand, LoaderCircle, LocateFixed, MapPinned, Search, Send } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Marker, Polyline } from 'react-leaflet'
import { BaseMap, FitBounds, FlyTo, MapClick } from '../../components/map/BaseMap'
import { homeIcon, pickupIcon } from '../../components/map/icons'
import { CoverageLayer, RouteLine, SchoolMarker, StopMarkers } from '../../components/map/layers'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Field, Input, Select } from '../../components/ui/Field'
import { EmptyState } from '../../components/ui/misc'
import { useToast } from '../../components/ui/toast-context'
import { routeColor } from '../../lib/colors'
import { cn } from '../../lib/cn'
import { GRADES } from '../../lib/constants'
import { effectiveWalk } from '../../lib/engine/boarding'
import { explainSeat, roadDescription } from '../../lib/engine/explain'
import { placeStudent } from '../../lib/engine/plan'
import { buildPlanView } from '../../lib/engine/view'
import { formatDistance, haversine } from '../../lib/geo'
import { href, navigate } from '../../lib/router'
import { hasRoadData, roadLevelNear } from '../../lib/roads'
import { reverseGeocode, searchPlaces, type Place } from '../../lib/services'
import type { LatLng, Student } from '../../lib/types'
import { addStudent, updateStudent } from '../../store/actions'
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
  const { state, view: currentView, update } = useStore()
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
  const [chosenStop, setChosenStop] = useState<string | null>(editing?.pinnedStopId ?? null)
  const geocodeAbort = useRef<AbortController | null>(null)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)

  const change = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const placeHome = (p: LatLng, knownAddress?: string) => {
    setHome(p)
    setChosenStop(null)
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
      const results = await searchPlaces(`${query.trim()}, Thiruvananthapuram`, state.settings.location)
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
        if (km > 30) toast({ tone: 'info', title: `You're ${Math.round(km)} km from school`, description: 'The demo covers Thiruvananthapuram, so this spot shows as out of range.' })
      },
      () => {
        setLocating(false)
        setSearchError('Location permission was denied. Search for your address or tap the map.')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  // Live preview: the real planner places this child as the newest request.
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
      pinnedVehicleId: editing?.pinnedVehicleId ?? null,
      pinnedStopId: chosenStop,
      feeOverride: editing?.feeOverride ?? null,
    }
    const next = { ...state, students: [...state.students.filter((s) => s.id !== draft.id), draft] }
    const plan = placeStudent(next, draft)
    const nextView = buildPlanView({ ...next, plan })
    return { draft, view: nextView, student: nextView.students.get(draft.id)! }
  }, [home, form, address, editing, chosenStop, state])

  const view = preview?.view ?? currentView
  const routes = [...view.routes.values()]
  const seated = preview?.student.status === 'seated' ? preview.student : null
  const focusId = seated?.vehicle.id ?? null

  const walk = effectiveWalk(state.settings)
  const alternatives = useMemo(() => {
    if (!home) return []
    return state.plan.stops
      .map((stop) => ({ stop, meters: haversine(home, stop.position) }))
      .filter((option) => option.meters <= walk * 1.5)
      .sort((a, b) => a.meters - b.meters)
      .slice(0, 5)
  }, [home, state.plan.stops, walk])

  const roadHere = home && hasRoadData(home) ? roadDescription(roadLevelNear(home)) : null

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
        pinnedStopId: chosenStop,
      }
      const id = editing?.id ?? uid('stu')
      if (editing) update((s) => updateStudent(s, id, payload))
      else update((s) => addStudent(s, { id, parentId: DEMO_PARENT.id, registeredAt: Date.now(), pinnedVehicleId: null, feeOverride: null, ...payload }))
      toast(
        seated
          ? { tone: 'success', title: `${payload.name.split(' ')[0]} is on ${seated.vehicle.label}`, description: 'The seat is confirmed and the school can see it.' }
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

  const fitPoints = editing ? [editing.home, state.settings.location] : [state.settings.location, ...state.plan.stops.map((s) => s.position)]

  return (
    <div className="grid grid-cols-1 lg:h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(380px,480px)_1fr]">
      {/* Map: top on mobile, right side on desktop. */}
      <div className="relative order-first h-[46vh] min-h-[320px] border-b border-line lg:order-none lg:col-start-2 lg:row-start-1 lg:h-auto lg:border-b-0 lg:border-l">
        <BaseMap center={state.settings.location} zoom={13} label="Pick your home location. Click or tap the map to drop a pin, then drag it to adjust.">
          <FitBounds points={fitPoints} fitKey="request" />
          <FlyTo target={flyTarget} />
          <MapClick onClick={(p) => placeHome(p)} />
          <CoverageLayer routes={routes} meters={state.settings.maxWalkMeters} />
          {routes.map((route) => (
            <RouteLine key={route.vehicle.id} route={route} emphasis={!focusId ? 'normal' : route.vehicle.id === focusId ? 'focus' : 'dim'} />
          ))}
          {routes.map((route) => (
            <StopMarkers key={route.vehicle.id} route={route} dim={!!focusId && route.vehicle.id !== focusId} compact={route.vehicle.id !== focusId} />
          ))}
          <SchoolMarker position={state.settings.location} name={state.settings.name} />
          {home && seated && (
            <>
              <Polyline positions={[home, seated.position]} pathOptions={{ color: '#1e1b4b', weight: 2.5, dashArray: '4 6', interactive: false }} />
              <Marker position={seated.position} icon={pickupIcon(routeColor(seated.vehicle.colorSlot))} keyboard={false} />
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
          Within {formatDistance(state.settings.maxWalkMeters)} of a route
        </div>
      </div>

      <form onSubmit={submit} noValidate className="flex min-w-0 flex-col lg:col-start-1 lg:row-start-1 lg:min-h-0">
        <div className="flex-1 px-4 py-6 sm:px-6 lg:overflow-y-auto">
          <a href={href('/parent')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-3 hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden="true" />
            My children
          </a>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-ink">{editing ? 'Update home location' : 'Request a seat'}</h1>
          <p className="mt-1 text-[15px] text-ink-2">{editing ? `Move the pin and ${editing.name.split(' ')[0]}'s boarding point is worked out again.` : "Tell us who's riding and where they live. The rest is worked out for you."}</p>

          <fieldset className="mt-6">
            <legend className="text-xs font-bold uppercase tracking-wider text-ink-3">1 · Child</legend>
            <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_150px]">
              <Field id="field-name" label="Child's full name" required error={errors.name}>
                {(p) => <Input {...p} value={form.name} onChange={(e) => change('name', e.target.value)} autoComplete="off" placeholder="e.g. Maya Nair" />}
              </Field>
              <Field id="field-grade" label="Class" required error={errors.grade}>
                {(p) => (
                  <Select {...p} value={form.grade} onChange={(e) => change('grade', e.target.value)}>
                    <option value="">Choose…</option>
                    {GRADES.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field id="field-parentName" label="Parent name" required error={errors.parentName}>
                {(p) => <Input {...p} value={form.parentName} onChange={(e) => change('parentName', e.target.value)} autoComplete="name" />}
              </Field>
              <Field id="field-parentPhone" label="Phone" required error={errors.parentPhone}>
                {(p) => <Input {...p} type="tel" inputMode="tel" value={form.parentPhone} onChange={(e) => change('parentPhone', e.target.value)} autoComplete="tel" />}
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
                      {roadHere ?? 'Pin placed, outside the area we have road data for'}
                    </span>
                  ) : (
                    'No pin yet. Tap the map, search above, or use your current location.'
                  ))}
              </div>

              <Field label="Address / landmark" hint={lookingUp ? 'Looking up the address…' : 'Filled in from the pin. Add a house number or landmark for the driver.'}>
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
              3 · Your plan
            </h2>
            <div className="mt-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
              {preview ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-ink">{seated ? 'A seat is available' : 'No seat here yet'}</p>
                    <StatusBadge student={preview.student} />
                  </div>
                  <AssignmentDetails student={preview.student} settings={state.settings} compact />
                  {seated && (
                    <ul className="flex list-disc flex-col gap-1 border-t border-line pl-5 pt-3 text-sm text-ink-2">
                      {explainSeat(seated).map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  )}
                  {alternatives.length > 0 && (
                    <Field label="Boarding point" hint="Picked for you. Choose another if one suits you better.">
                      {(p) => (
                        <Select {...p} value={chosenStop ?? 'auto'} onChange={(e) => setChosenStop(e.target.value === 'auto' ? null : e.target.value)}>
                          <option value="auto">Automatic (recommended)</option>
                          {alternatives.map(({ stop, meters }) => (
                            <option key={stop.id} value={stop.id}>
                              {stop.name} · {formatDistance(meters)} walk
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  )}
                </div>
              ) : (
                <p className="text-sm text-ink-3">Place your home pin to see the boarding point, vehicle, pickup time and fee.</p>
              )}
            </div>
          </section>
        </div>

        <div className="sticky bottom-0 border-t border-line bg-surface/95 px-4 py-4 backdrop-blur sm:px-6">
          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
                Planning your route…
              </>
            ) : (
              <>
                <Send className="size-4" aria-hidden="true" />
                {editing ? 'Save new location' : preview?.student.status === 'waitlisted' ? 'Join the waitlist' : 'Confirm request'}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
