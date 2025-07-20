import type { LeagueMembership } from "./league"

export type User = {
  id: string
  username: string
  email: string
  leagues?: LeagueMembership[]
}
