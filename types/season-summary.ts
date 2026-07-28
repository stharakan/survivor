export type PrizeType = "first_place" | "second_place" | "longest_survivor" | "highest_total_points"

export type PrizeWinner = {
  prize: PrizeType
  prizeName: string
  icon: string
  userId: string
  playerName: string
  stat: string
  payout?: string
}

export type FinalStanding = {
  rank: number
  userId: string
  playerName: string
  pointsAtElimination: number
  totalPoints: number
  strikes: number
  weekEliminated: number | null
}

export type SeasonSummary = {
  isLeagueEnded: boolean
  prizes: PrizeWinner[]
  standings: FinalStanding[]
}
