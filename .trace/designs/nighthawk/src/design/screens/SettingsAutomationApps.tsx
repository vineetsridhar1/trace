import SettingsRepositories from "./SettingsRepositories";
import { AutomationDialog } from "../components/settings/automation";

export default function SettingsAutomationApps() {
  return <AutomationDialog active="apps" background={<SettingsRepositories />} />;
}
