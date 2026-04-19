import {
  Pencil,
  FileText,
  Circle,
  AlertTriangle,
  ArrowUp,
  Minus,
  ArrowDown,
  Users,
  Tag,
  Hash,
  User as UserIcon,
  Calendar,
  type LucideIcon,
} from "lucide-react";
import type { Priority, TicketStatus, User } from "@trace/gql";
import { useEntityField } from "@trace/client-core";
import { timeAgo } from "../../lib/utils";
import {
  ticketStatusLabel,
  ticketStatusColor,
  ticketPriorityLabel,
  ticketPriorityColor,
} from "./tickets-table-types";

const priorityIcon: Record<Priority, LucideIcon> = {
  urgent: AlertTriangle,
  high: ArrowUp,
  medium: Minus,
  low: ArrowDown,
};

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | React.ReactNode;
}) {
  return (
    <>
      <Icon size={16} className="shrink-0 text-muted-foreground" />
      <div className="text-sm text-muted-foreground">{label}</div>
      {typeof value === "string" ? (
        <div className="text-sm text-foreground line-clamp-2">{value}</div>
      ) : (
        value
      )}
    </>
  );
}

function StatusValue({ status }: { status: TicketStatus }) {
  const label = ticketStatusLabel[status] ?? status;
  const color = ticketStatusColor[status] ?? "text-muted-foreground";

  return (
    <div className="flex items-center gap-1.5">
      <Circle size={8} className={`shrink-0 fill-current ${color}`} />
      <span className={`text-sm font-medium ${color}`}>{label}</span>
    </div>
  );
}

function PriorityValue({ priority }: { priority: Priority }) {
  const label = ticketPriorityLabel[priority] ?? priority;
  const color = ticketPriorityColor[priority] ?? "text-muted-foreground";
  const Icon = priorityIcon[priority] ?? Minus;

  return (
    <div className={`flex items-center gap-1.5 ${color}`}>
      <Icon size={14} className="shrink-0" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

function AssigneesValue({ assignees }: { assignees: User[] }) {
  if (!assignees || assignees.length === 0) {
    return <span className="text-sm text-muted-foreground/50">Unassigned</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      {assignees.map((user: User) => (
        <div key={user.id} className="flex items-center gap-1.5">
          {user.avatarUrl && (
            <img src={user.avatarUrl} alt={user.name} className="h-4 w-4 rounded-full" />
          )}
          <span className="text-sm text-foreground">{user.name}</span>
        </div>
      ))}
    </div>
  );
}

function UserValue({ user }: { user: { name: string; avatarUrl?: string | null } }) {
  return (
    <div className="flex items-center gap-1.5">
      {user.avatarUrl && (
        <img src={user.avatarUrl} alt={user.name} className="h-4 w-4 rounded-full" />
      )}
      <span className="text-sm text-foreground">{user.name}</span>
    </div>
  );
}

function ChannelValue({ channelId }: { channelId?: string | null }) {
  // Hook must be called unconditionally; passes "" when no channelId (returns undefined safely)
  const channelName = useEntityField("channels", channelId ?? "", "name");

  if (!channelId) {
    return <span className="text-sm text-muted-foreground/50">No channel</span>;
  }

  return (
    <div className="flex items-center gap-1">
      <Hash size={12} className="text-muted-foreground" />
      <span className="text-sm text-foreground">{channelName ?? channelId.slice(0, 8)}</span>
    </div>
  );
}

function LabelsValue({ labels }: { labels: string[] }) {
  if (labels.length === 0) {
    return <span className="text-sm text-muted-foreground/50">No labels</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((label) => (
        <span
          key={label}
          className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-muted-foreground"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

export function TicketDetailsSection({ ticketId }: { ticketId: string }) {
  const title = useEntityField("tickets", ticketId, "title");
  const description = useEntityField("tickets", ticketId, "description");
  const status = useEntityField("tickets", ticketId, "status");
  const priority = useEntityField("tickets", ticketId, "priority");
  const assignees = useEntityField("tickets", ticketId, "assignees");
  const labels = useEntityField("tickets", ticketId, "labels");
  const channel = useEntityField("tickets", ticketId, "channel") as { id: string } | null | undefined;
  const createdBy = useEntityField("tickets", ticketId, "createdBy") as { name: string; avatarUrl?: string | null } | null | undefined;
  const createdAt = useEntityField("tickets", ticketId, "createdAt");
  const updatedAt = useEntityField("tickets", ticketId, "updatedAt");

  if (!title) return null;

  return (
    <div className="grid grid-cols-[20px_80px_1fr] gap-x-3 gap-y-4 items-start">
      <DetailItem
        icon={Pencil}
        label="Title"
        value={title}
      />
      <DetailItem
        icon={FileText}
        label="Description"
        value={description || "No description"}
      />
      <DetailItem
        icon={Circle}
        label="Status"
        value={<StatusValue status={status!} />}
      />
      <DetailItem
        icon={AlertTriangle}
        label="Priority"
        value={<PriorityValue priority={priority!} />}
      />
      <DetailItem
        icon={Users}
        label="Assignees"
        value={<AssigneesValue assignees={assignees ?? ([] as User[])} />}
      />
      <DetailItem
        icon={Tag}
        label="Labels"
        value={<LabelsValue labels={labels ?? []} />}
      />
      <DetailItem
        icon={Hash}
        label="Channel"
        value={<ChannelValue channelId={channel?.id} />}
      />
      <DetailItem
        icon={UserIcon}
        label="Created by"
        value={
          createdBy ? (
            <UserValue user={createdBy} />
          ) : (
            "Unknown"
          )
        }
      />
      <DetailItem
        icon={Calendar}
        label="Created"
        value={timeAgo(createdAt!)}
      />
      <DetailItem
        icon={Calendar}
        label="Updated"
        value={timeAgo(updatedAt!)}
      />
    </div>
  );
}
