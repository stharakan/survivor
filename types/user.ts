import type { LeagueMembership } from "./league"

export type User = {
  id: string
  email: string
  name?: string
  leagues?: LeagueMembership[]
  // NEW, no lib/db.ts twin -- flags an account as an AI-driven team.
  isAI?: boolean
}
