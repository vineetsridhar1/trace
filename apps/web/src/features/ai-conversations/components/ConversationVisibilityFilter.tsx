import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import type { VisibilityFilter } from "./ConversationListContainer";

interface ConversationVisibilityFilterProps {
  value: VisibilityFilter;
  onChange: (value: VisibilityFilter) => void;
}

export function ConversationVisibilityFilter({
  value,
  onChange,
}: ConversationVisibilityFilterProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as VisibilityFilter)}>
      <SelectTrigger className="h-8 w-[100px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        <SelectItem value="private">Private</SelectItem>
        <SelectItem value="shared">Shared</SelectItem>
      </SelectContent>
    </Select>
  );
}
