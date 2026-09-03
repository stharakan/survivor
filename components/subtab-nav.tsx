"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"

/**
 * Arrow-based stepper shared by the make-picks gameweek nav and the
 * results/rules subtabs: the current item's name is the big centered heading,
 * flanked by prev/next arrows. An arrow renders only when its handler is set,
 * so it's omitted at the ends of the sequence. The small caption under each
 * arrow is optional (`prevLabel`/`nextLabel`) -- subtab pages name their
 * destination, make-picks leaves the gameweek arrows uncaptioned.
 */
interface SubtabNavProps {
  title: string
  prevLabel?: string
  nextLabel?: string
  onPrev?: () => void
  onNext?: () => void
  // Set false to suspend the Left/Right arrow-key shortcuts, e.g. while a modal
  // on the host page is open (make-picks' Available Teams dialog).
  keyboardEnabled?: boolean
}

export function SubtabNav({ title, prevLabel, nextLabel, onPrev, onNext, keyboardEnabled = true }: SubtabNavProps) {
  // Left/Right arrow keys step between items. Skipped while a form control has
  // focus so typing elsewhere on the page isn't hijacked, and entirely off when
  // the host disables it.
  useEffect(() => {
    if (!keyboardEnabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return

      if (e.key === "ArrowRight") {
        onNext?.()
      } else if (e.key === "ArrowLeft") {
        onPrev?.()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onPrev, onNext, keyboardEnabled])

  return (
    <div className="flex items-start justify-center gap-3 mt-2 sm:gap-4">
      {/* Left column: previous item (empty at the start of the sequence, but
          kept in the layout so the title stays centered). Arrow shows whenever
          there's somewhere to go back to; the caption is optional. */}
      <div className="flex w-20 shrink-0 flex-col items-center gap-1 sm:w-24">
        {onPrev && (
          <Button
            variant="outline"
            size="icon"
            aria-label={prevLabel ? `Previous: ${prevLabel}` : "Previous"}
            className="border-2 border-black"
            onClick={onPrev}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
        {prevLabel && (
          <span className="text-center text-[10px] leading-tight text-muted-foreground">{prevLabel}</span>
        )}
      </div>

      <h1 className="flex min-h-10 items-center text-center font-heading text-2xl md:text-3xl">{title}</h1>

      {/* Right column: next item. */}
      <div className="flex w-20 shrink-0 flex-col items-center gap-1 sm:w-24">
        {onNext && (
          <Button
            variant="outline"
            size="icon"
            aria-label={nextLabel ? `Next: ${nextLabel}` : "Next"}
            className="border-2 border-black"
            onClick={onNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
        {nextLabel && (
          <span className="text-center text-[10px] leading-tight text-muted-foreground">{nextLabel}</span>
        )}
      </div>
    </div>
  )
}
