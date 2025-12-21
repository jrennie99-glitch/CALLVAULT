import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

interface LabeledSwitchProps extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root> {
  showLabels?: boolean;
}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  LabeledSwitchProps
>(({ className, showLabels = true, checked, disabled, ...props }, ref) => (
  <div className="relative inline-flex items-center">
    <SwitchPrimitives.Root
      className={cn(
        "peer inline-flex h-8 w-16 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        disabled ? "cursor-not-allowed opacity-40" : "",
        checked ? "bg-emerald-500" : "bg-slate-600",
        className
      )}
      checked={checked}
      disabled={disabled}
      {...props}
      ref={ref}
    >
      {showLabels && (
        <span className={cn(
          "absolute text-[10px] font-bold uppercase tracking-wide transition-opacity",
          checked ? "left-2 text-white opacity-100" : "left-2 opacity-0"
        )}>
          On
        </span>
      )}
      {showLabels && (
        <span className={cn(
          "absolute text-[10px] font-bold uppercase tracking-wide transition-opacity",
          checked ? "right-2 opacity-0" : "right-2 text-slate-300 opacity-100"
        )}>
          Off
        </span>
      )}
      <SwitchPrimitives.Thumb
        className={cn(
          "pointer-events-none block h-6 w-6 rounded-full bg-white shadow-lg ring-0 transition-transform",
          checked ? "translate-x-8" : "translate-x-1"
        )}
      />
    </SwitchPrimitives.Root>
  </div>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
