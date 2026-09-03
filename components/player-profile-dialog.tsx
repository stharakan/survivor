"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { UserIcon, Bot } from "lucide-react"
import type { Player } from "@/types/player"

/**
 * A player's public profile, shown as a modal peek from the scoreboard rather
 * than a full-page route. Fed directly by the scoreboard's `Player` row, so it
 * needs no fetch -- and its rank is the scoreboard's live-computed rank
 * (sorted by points desc, strikes asc), not the stale stored `membership.rank`
 * that the old `/player` page read (which was always 0). Pick history is
 * intentionally not shown here -- picks are self-only (see getUserPicks).
 */
interface PlayerProfileDialogProps {
  player: Player | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PlayerProfileDialog({ player, open, onOpenChange }: PlayerProfileDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-4 border-black p-0 gap-0 sm:rounded-none">
        <DialogHeader className="bg-retro-orange text-white border-b-4 border-black p-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            {player?.isAI ? <Bot className="h-5 w-5" /> : <UserIcon className="h-5 w-5" />}
            {player?.name || "Player"}
          </DialogTitle>
        </DialogHeader>

        <div className="p-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="border-2 border-black p-3 text-center">
              <p className="text-sm font-medium text-muted-foreground">Points</p>
              <p className="text-2xl font-bold">{player?.points ?? 0}</p>
            </div>

            <div className="border-2 border-black p-3 text-center">
              <p className="text-sm font-medium text-muted-foreground">Strikes</p>
              <p className="text-2xl font-bold">{player?.strikes ?? 0}</p>
            </div>

            <div className="border-2 border-black p-3 text-center">
              <p className="text-sm font-medium text-muted-foreground">Rank</p>
              <p className="text-2xl font-bold">{player?.rank ? `#${player.rank}` : "-"}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
