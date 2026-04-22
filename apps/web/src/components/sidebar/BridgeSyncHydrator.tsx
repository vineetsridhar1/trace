import { useMyBridges } from "../../hooks/useMyBridges";

export function BridgeSyncHydrator() {
  useMyBridges();
  return null;
}
