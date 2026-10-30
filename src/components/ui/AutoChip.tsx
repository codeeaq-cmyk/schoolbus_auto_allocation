import { Hand, Sparkles } from 'lucide-react'
import { Badge } from './Badge'

/** Marks whether the system or a person made this decision. */
export function DecisionChip({ manual }: { manual: boolean }) {
  return manual ? (
    <Badge tone="warning" icon={<Hand />}>
      Manual
    </Badge>
  ) : (
    <Badge tone="primary" icon={<Sparkles />}>
      Auto
    </Badge>
  )
}
