import type { Game } from "./game"
import type { Team } from "./team"

export type Pick = {
  id: number
  user: number
  game: Game
  team: Team
  result: "win" | "loss" | null
  week: number
}
