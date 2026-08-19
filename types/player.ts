export type Player = {
  id: string
  name: string
  points: number
  strikes: number
  rank: number
  weeklyPick?: string
  // NEW, no lib/db.ts twin -- drives the scoreboard's Bot badge.
  isAI?: boolean
}
