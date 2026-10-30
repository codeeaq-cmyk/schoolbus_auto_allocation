import type { Transition, Variants } from 'motion/react'

// One rhythm for the whole app. Arrivals decelerate; exits are quicker than entrances.
export const EASE_OUT = [0.16, 1, 0.3, 1] as const

export const spring: Transition = { type: 'spring', stiffness: 460, damping: 36, mass: 0.8 }
export const softSpring: Transition = { type: 'spring', stiffness: 240, damping: 26 }

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.44, ease: EASE_OUT } },
}

export const staggerList: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.03 } },
}
