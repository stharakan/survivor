import type { Game } from "./game"
import type { Team } from "./team"

export type Pick = {
  id: string
  user: string
  game: Game
  team: Team
  result: "win" | "loss" | null
  week: number
}
