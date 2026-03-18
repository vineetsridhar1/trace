"use client"

import * as React from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

/**
 * Responsive dialog that renders as a centered dialog on desktop
 * and a bottom sheet (drawer) on mobile for better touch UX.
 *
 * Drop-in replacement for Dialog — same sub-component API.
 */

function ResponsiveDialog({ ...props }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode }) {
  const isMobile = useIsMobile()
  if (isMobile) return <Sheet {...props} />
  return <Dialog {...props} />
}

function ResponsiveDialogTrigger({ ...props }: React.ComponentProps<typeof DialogTrigger>) {
  const isMobile = useIsMobile()
  if (isMobile) return <SheetTrigger {...props} />
  return <DialogTrigger {...props} />
}

function ResponsiveDialogClose({ ...props }: React.ComponentProps<typeof DialogClose>) {
  const isMobile = useIsMobile()
  if (isMobile) return <SheetClose {...props} />
  return <DialogClose {...props} />
}

function ResponsiveDialogContent({
  className,
  children,
  showCloseButton,
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <SheetContent
        side="bottom"
        showCloseButton={showCloseButton}
        className={cn(
          "max-h-[85dvh] overflow-y-auto rounded-t-xl p-4",
          className
        )}
      >
        {/* Drag handle indicator */}
        <div className="mx-auto mb-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
        {children}
      </SheetContent>
    )
  }
  return (
    <DialogContent className={className} showCloseButton={showCloseButton} {...props}>
      {children}
    </DialogContent>
  )
}

function ResponsiveDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  const isMobile = useIsMobile()
  if (isMobile) return <SheetHeader className={cn("text-left", className)} {...props} />
  return <DialogHeader className={className} {...props} />
}

function ResponsiveDialogFooter({ className, children, showCloseButton, ...props }: React.ComponentProps<typeof DialogFooter>) {
  const isMobile = useIsMobile()
  if (isMobile) {
    return (
      <SheetFooter className={cn("flex flex-col gap-2 pt-2", className)} {...(props as React.ComponentProps<"div">)}>
        {children}
        {showCloseButton && (
          <SheetClose render={<button className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground" />}>
            Close
          </SheetClose>
        )}
      </SheetFooter>
    )
  }
  return (
    <DialogFooter className={className} showCloseButton={showCloseButton} {...props}>
      {children}
    </DialogFooter>
  )
}

function ResponsiveDialogTitle({ ...props }: React.ComponentProps<typeof DialogTitle>) {
  const isMobile = useIsMobile()
  if (isMobile) return <SheetTitle {...props} />
  return <DialogTitle {...props} />
}

function ResponsiveDialogDescription({ ...props }: React.ComponentProps<typeof DialogDescription>) {
  const isMobile = useIsMobile()
  if (isMobile) return <SheetDescription {...props} />
  return <DialogDescription {...props} />
}

export {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
}
