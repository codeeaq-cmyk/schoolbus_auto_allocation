import { ArrowRight, Hourglass, MapPinned, Plus, Sparkles, Ticket } from 'lucide-react'
import { ButtonLink } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState, PageHeader } from '../../components/ui/misc'
import { Stagger, StaggerItem } from '../../components/ui/motion'
import { formatDistance } from '../../lib/geo'
import { href } from '../../lib/router'
import { useStore } from '../../store/context'
import { DEMO_PARENT } from '../../store/state'
import { BoardingPass, WaitlistCard } from './BoardingPass'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export function ParentHome() {
  const { state, view } = useStore()
  const { settings } = state
  const children = state.students.filter((s) => s.parentId === DEMO_PARENT.id).sort((a, b) => a.registeredAt - b.registeredAt)

  const steps = [
    { icon: <MapPinned />, title: 'Pin your home', body: `A boarding point within ${formatDistance(settings.maxWalkMeters)} on foot is picked for you, on a road a vehicle can reach.` },
    { icon: <Ticket />, title: 'Get your pass', body: 'See the vehicle, pickup time and fee straight away. Prefer another nearby stop? Choose it yourself.' },
    { icon: <Hourglass />, title: 'Full right now?', body: 'You join a queue and are seated automatically when a seat opens. Earlier requests are favoured.' },
  ]

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6 sm:py-10">
      <PageHeader
        eyebrow={`${greeting()}, ${DEMO_PARENT.name.split(' ')[0]}`}
        title="School transport"
        description={`Request a seat with ${settings.name} and see exactly where and when your child will be picked up.`}
        actions={
          children.length > 0 ? (
            <ButtonLink href={href('/parent/request')} size="lg">
              <Plus className="size-5" aria-hidden="true" />
              Add a child
            </ButtonLink>
          ) : undefined
        }
      />

      <section aria-labelledby="children-heading" className="mt-8">
        <h2 id="children-heading" className="sr-only">
          Your children
        </h2>
        {children.length === 0 ? (
          <Card>
            <EmptyState
              illustrated
              title="Let's get your child a seat"
              action={
                <ButtonLink href={href('/parent/request')} size="lg">
                  <Plus className="size-5" aria-hidden="true" />
                  Request a seat
                </ButtonLink>
              }
            >
              Drop a pin at your home. The boarding point, vehicle, pickup time and fee are worked out for you. It takes about a minute.
            </EmptyState>
          </Card>
        ) : (
          <Stagger as="ul" className="grid gap-6 md:grid-cols-2">
            {children.map((child) => {
              const student = view.students.get(child.id)
              return (
                <StaggerItem as="li" key={child.id} className="flex flex-col gap-3">
                  {student?.status === 'seated' ? <BoardingPass student={student} compact /> : student?.status === 'waitlisted' ? <WaitlistCard student={student} settings={settings} /> : null}
                  <a href={href(`/parent/child/${child.id}`)} className="group inline-flex items-center gap-1.5 self-end rounded-lg text-sm font-bold text-primary">
                    {student?.status === 'seated' ? 'Live tracking and details' : 'View request'}
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
                  </a>
                </StaggerItem>
              )
            })}
          </Stagger>
        )}
      </section>

      <section aria-labelledby="how-heading" className="mt-10">
        <h2 id="how-heading" className="flex items-center gap-2 text-base font-bold text-ink">
          <Sparkles className="size-4 text-primary" aria-hidden="true" />
          How it works
        </h2>
        <Stagger as="ol" className="mt-3 grid gap-3 sm:grid-cols-3">
          {steps.map((step) => (
            <StaggerItem as="li" key={step.title} className="rounded-3xl bg-surface p-5">
              <span className="grid size-10 place-items-center rounded-2xl bg-accent-soft text-ink [&>svg]:size-5" aria-hidden="true">
                {step.icon}
              </span>
              <h3 className="mt-3 font-bold text-ink">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{step.body}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>
    </div>
  )
}
