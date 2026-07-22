import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";

export function DesignEditorSelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0 space-y-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <Select value={value} onValueChange={(next) => next && onChange(next)}>
        <SelectTrigger className="h-8 w-full bg-muted/35 px-2.5 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
