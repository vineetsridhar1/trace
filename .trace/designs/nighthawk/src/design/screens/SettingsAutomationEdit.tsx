import SettingsRepositories from "./SettingsRepositories";
import { AutomationDialog } from "../components/settings/automation";

export default function SettingsAutomationEdit() {
  return <AutomationDialog active="setup" background={<SettingsRepositories />} />;
}
