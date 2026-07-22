import { Input } from "../../ui/input";

export function DesignEditorTextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0 space-y-1 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <Input
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        className="h-8 bg-muted/35 px-2.5 font-mono text-[11px]"
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
