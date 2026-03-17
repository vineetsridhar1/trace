import { useState, useRef, useCallback } from "react";
import { Circle, GitBranch, MoreHorizontal, Trash2 } from "lucide-react";
import { motion, useMotionValue, useTransform, useAnimation, type PanInfo } from "framer-motion";
import { useEntityField } from "../../stores/entity";
import { useUIStore } from "../../stores/ui";
import { statusColor, statusLabel } from "../session/sessionStatus";
import { timeAgo } from "../../lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "../ui/popover";
import { Button } from "../ui/button";
import { DeleteSessionDialog } from "../session/DeleteSessionDialog";

const SWIPE_THRESHOLD = -80;

export function SessionRow({ id }: { id: string }) {
  const name = useEntityField("sessions", id, "name");
  const status = useEntityField("sessions", id, "status");
  const updatedAt = useEntityField("sessions", id, "updatedAt");
  const lastEventPreview = useEntityField("sessions", id, "_lastEventPreview");
  const parentSession = useEntityField("sessions", id, "parentSession") as { id: string; name: string } | null | undefined;
  const createdBy = useEntityField("sessions", id, "createdBy");
  const setActiveSessionId = useUIStore((s) => s.setActiveSessionId);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [swiped, setSwiped] = useState(false);

  // Swipe-to-delete (mobile)
  const x = useMotionValue(0);
  const controls = useAnimation();
  const trashOpacity = useTransform(x, [-80, -40, 0], [1, 0.5, 0]);

  const handleDragEnd = useCallback((_: unknown, info: PanInfo) => {
    if (info.offset.x < SWIPE_THRESHOLD) {
      controls.start({ x: SWIPE_THRESHOLD });
      setSwiped(true);
    } else {
      controls.start({ x: 0 });
      setSwiped(false);
    }
  }, [controls]);

  const handleTrashClick = useCallback(() => {
    setDeleteOpen(true);
    controls.start({ x: 0 });
    setSwiped(false);
  }, [controls]);

  return (
    <>
      <div className="relative overflow-hidden">
        {/* Trash reveal behind the row (mobile only) */}
        <motion.div
          className="absolute inset-y-0 right-0 flex items-center justify-center w-20 bg-destructive/10 sm:hidden"
          style={{ opacity: trashOpacity }}
        >
          <button type="button" onClick={handleTrashClick} className="p-2 text-destructive">
            <Trash2 size={18} />
          </button>
        </motion.div>

        <motion.div
          drag="x"
          dragDirectionLock
          dragConstraints={{ left: SWIPE_THRESHOLD, right: 0 }}
          dragElastic={0.1}
          style={{ x }}
          animate={controls}
          onDragEnd={handleDragEnd}
          className="relative bg-background sm:!transform-none"
        >
          <button
            type="button"
            className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-3 py-2.5 text-left transition-colors hover:bg-surface-elevated/50 cursor-pointer sm:grid-cols-[auto_minmax(14rem,1fr)_8rem_8rem_8rem_2rem]"
            onClick={() => setActiveSessionId(id)}
          >
            <Circle size={8} className={`mt-1 shrink-0 fill-current ${statusColor[status ?? "active"]}`} />

            <div className="min-w-0 flex-1">
              <span className="text-sm text-foreground truncate block">{name}</span>
              {parentSession && (
                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <GitBranch size={10} className="shrink-0" />
                  <span className="truncate">from {parentSession.name}</span>
                </span>
              )}
              {lastEventPreview && !parentSession && (
                <span className="mt-0.5 truncate block border-l-2 border-muted-foreground/30 pl-2 text-xs text-muted-foreground italic">
                  {lastEventPreview}
                </span>
              )}
            </div>

            <span className={`hidden w-full min-w-0 self-start truncate pt-0.5 text-left text-xs sm:inline ${statusColor[status ?? "active"]}`}>
              {statusLabel[status ?? "active"]}
            </span>

            <div className="hidden min-w-0 w-full items-center gap-1.5 self-start pt-0.5 sm:flex">
              {createdBy?.avatarUrl ? (
                <img
                  src={createdBy.avatarUrl}
                  alt={createdBy.name}
                  className="h-4 w-4 rounded-full"
                />
              ) : null}
              <span className="min-w-0 truncate text-left text-xs text-muted-foreground">{createdBy?.name}</span>
            </div>

            <span className="w-full min-w-0 self-start truncate pt-0.5 text-left text-xs text-muted-foreground">
              {updatedAt ? timeAgo(updatedAt) : ""}
            </span>

            {/* Spacer for three-dot column on desktop — actual button is positioned outside to avoid nesting */}
            <span className="hidden sm:block" />
          </button>

          {/* Three-dot menu (desktop only) */}
          <div className="hidden sm:flex absolute right-1 top-1/2 -translate-y-1/2 items-center">
            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="opacity-0 group-hover/session-row:opacity-100 data-[popup-open]:opacity-100"
                  />
                }
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              >
                <MoreHorizontal size={14} />
              </PopoverTrigger>
              <PopoverContent align="end" side="bottom" className="w-36 p-1">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </PopoverContent>
            </Popover>
          </div>
        </motion.div>
      </div>

      <DeleteSessionDialog
        sessionId={id}
        sessionName={name ?? "Untitled"}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
