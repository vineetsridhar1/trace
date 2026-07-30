import { motion } from "framer-motion";
import { getInitials, timeAgo } from "../../lib/utils";
import { navigateToSessionGroup } from "../../stores/ui";
import { HomeKindIcon } from "./HomeKindIcon";
import type { HomeWorkItem } from "./home-work-data";
import { HomeWorkRowActions } from "./HomeWorkRowActions";

export function HomeWorkRow({ item }: { item: HomeWorkItem }) {
  const open = () => navigateToSessionGroup(item.channelId, item.groupId, item.sessionId);
  const statusClass =
    item.agentStatus === "failed"
      ? "text-red-400"
      : item.bucket === "needs_you"
        ? "text-[var(--th-primary)]"
        : item.bucket === "done_today"
          ? "text-[var(--th-muted)]"
          : "font-mono text-[var(--th-status-live)]";

  return (
    <motion.div
      layout="position"
      transition={{ duration: 0.2, ease: "easeOut" }}
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
      className="group h-16 cursor-pointer border-t border-[var(--th-edge-faint)] px-4 outline-none transition-colors hover:bg-white/[0.025] focus-visible:bg-[var(--th-accent-tint)] md:h-10"
    >
      <div className="grid h-full grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-3 md:grid-cols-[14px_minmax(120px,340px)_minmax(150px,1fr)_auto_78px_56px_20px] md:gap-x-3">
        <HomeKindIcon
          kind={item.kind}
          className={`size-3.5 ${item.bucket === "done_today" ? "opacity-60" : ""}`}
        />
        <div className="min-w-0 self-center">
          <p
            className={`truncate text-[13px] font-medium ${
              item.bucket === "done_today" ? "text-[var(--th-primary)]" : "text-[var(--th-heading)]"
            }`}
          >
            {item.title}
          </p>
          <p className={`mt-0.5 truncate text-[11.5px] md:hidden ${statusClass}`}>
            {item.statusText}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 md:contents">
          <p className={`hidden min-w-0 truncate text-[11.5px] md:block ${statusClass}`}>
            {item.statusText}
          </p>
          <span onClick={(event) => event.stopPropagation()}>
            <HomeWorkRowActions item={item} />
          </span>
          <span className="hidden truncate text-[11px] text-[var(--th-muted)] md:block">
            {item.repoName ?? "—"}
          </span>
          <span className="hidden text-right text-[11px] tabular-nums text-[var(--th-muted)] md:block">
            {timeAgo(item.activityAt)}
          </span>
          <WorkAvatar item={item} />
        </div>
      </div>
    </motion.div>
  );
}

function WorkAvatar({ item }: { item: HomeWorkItem }) {
  const owner = item.owner;
  return (
    <span
      title={owner?.name ?? "Trace agent"}
      className={`hidden size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--th-surface-elevated)] text-[8px] font-semibold text-foreground md:flex ${
        item.bucket === "done_today" ? "opacity-60" : ""
      }`}
    >
      {owner?.avatarUrl ? (
        <img src={owner.avatarUrl} alt={owner.name} className="size-full object-cover" />
      ) : (
        getInitials(owner?.name ?? "Trace")
      )}
    </span>
  );
}
