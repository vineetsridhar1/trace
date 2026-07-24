import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useThemeStore, type ThemePreference } from "../../stores/theme";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

const THEME_LABELS: Record<ThemePreference, string> = {
  dark: "Dark",
  light: "Light",
};

export function AppearanceSection() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">Appearance</h2>
        <p className="text-sm text-muted-foreground">
          Choose how Trace looks. Dark is the default.
        </p>
      </div>

      <div className="space-y-4 rounded-lg border border-border bg-surface-deep p-4">
        <div>
          <label className="mb-1.5 block text-sm text-muted-foreground">Theme</label>
          <Select
            value={theme}
            onValueChange={(value) => {
              if (value === "dark" || value === "light") setTheme(value);
            }}
          >
            <SelectTrigger className="w-full max-w-xs">
              <SelectValue>{THEME_LABELS[theme]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {THEME_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
