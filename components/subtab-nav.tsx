"use client"

import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

/**
 * Arrow-based navigation for a page's subtabs, mirroring the gameweek stepper
 * on the make-picks page: the current subtab's name is the big centered
 * heading, flanked by prev/next arrows. Under each arrow, small text names
 * where that arrow takes you. Arrows are omitted at the ends of the sequence.
 */
interface SubtabNavProps {
  title: string
  prevLabel?: string
  nextLabel?: string
  onPrev?: () => void
  onNext?: () => void
}

export function SubtabNav({ title, prevLabel, nextLabel, onPrev, onNext }: SubtabNavProps) {
  return (
    <div className="flex items-start justify-center gap-3 sm:gap-4">
      {/* Left column: previous subtab (empty at the start of the sequence, but
          kept in the layout so the title stays centered). */}
      <div className="flex w-20 shrink-0 flex-col items-center gap-1 sm:w-24">
        {prevLabel && (
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label={`Previous: ${prevLabel}`}
              className="border-2 border-black"
              onClick={onPrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-center text-[10px] leading-tight text-muted-foreground">{prevLabel}</span>
          </>
        )}
      </div>

      <h1 className="flex min-h-10 items-center text-center font-heading text-2xl md:text-3xl">{title}</h1>

      {/* Right column: next subtab. */}
      <div className="flex w-20 shrink-0 flex-col items-center gap-1 sm:w-24">
        {nextLabel && (
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label={`Next: ${nextLabel}`}
              className="border-2 border-black"
              onClick={onNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-center text-[10px] leading-tight text-muted-foreground">{nextLabel}</span>
          </>
        )}
      </div>
    </div>
  )
}
