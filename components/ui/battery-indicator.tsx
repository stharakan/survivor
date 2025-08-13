import React from "react"
import { X } from "lucide-react"

interface BatteryIndicatorProps {
  remaining: number
  className?: string
}

export function BatteryIndicator({ remaining, className = "" }: BatteryIndicatorProps) {
  const getBatteryColor = (remaining: number) => {
    switch (remaining) {
      case 2:
        return "bg-retro-green"
      case 1:
        return "bg-retro-yellow" 
      default:
        return "bg-gray-300"
    }
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <div className="relative flex">
        {/* Battery body */}
        <div className="flex h-3 w-6 border border-black bg-white dark:bg-gray-900">
          {/* First bar (left side) */}
          <div className={`w-1/2 ${remaining === 0 ? '' : 'border-r border-black'} ${remaining >= 1 ? getBatteryColor(remaining) : 'bg-gray-200'}`} />
          {/* Second bar (right side) */}
          <div className={`w-1/2 ${remaining >= 2 ? getBatteryColor(remaining) : 'bg-gray-200'}`} />
        </div>
        {/* Battery tip */}
        <div className="h-1.5 w-0.5 border border-l-0 border-black self-center bg-white dark:bg-gray-900" />
        
        {/* Red X overlay for empty battery */}
        {remaining === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <X className="h-2 w-2 text-retro-red" />
          </div>
        )}
      </div>
    </div>
  )
}