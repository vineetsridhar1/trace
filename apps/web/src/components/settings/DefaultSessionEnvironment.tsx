import { useSessionEnvironmentStore } from "../../stores/session-environment";
import { isLocalMode } from "../../lib/runtime-mode";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

export function DefaultSessionEnvironment() {
  const environment = useSessionEnvironmentStore((state) => state.defaultEnvironment);
  const setEnvironment = useSessionEnvironmentStore((state) => state.setDefaultEnvironment);

  return (
    <div className="mt-4">
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        Default environment
      </label>
      <Select
        value={environment}
        onValueChange={(value) => {
          if (value === "cloud" || value === "local") setEnvironment(value);
        }}
      >
        <SelectTrigger className="w-full md:w-48" aria-label="Default environment">
          <SelectValue>{environment === "cloud" ? "Cloud" : "Local"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="cloud" disabled={isLocalMode}>
            Cloud
          </SelectItem>
          <SelectItem value="local">Local</SelectItem>
        </SelectContent>
      </Select>
      <p className="mt-1.5 text-xs leading-4 text-muted-foreground">
        Saved on this device for new coding sessions. You can choose a different environment when
        starting a session.
      </p>
    </div>
  );
}
