import type { LeagueMembership } from "./league"

export type User = {
  id: string
  email: string
  name?: string
  leagues?: LeagueMembership[]
}
