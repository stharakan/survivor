import type { LeagueMembership } from "./league"

export type User = {
  id: number
  username: string
  email: string
  leagues?: LeagueMembership[]
}
