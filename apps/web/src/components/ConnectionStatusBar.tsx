import { useNavigate } from 'react-router-dom';
import { FiWifi, FiWifiOff, FiChevronLeft } from 'react-icons/fi';
import { useInstanceStore } from '../stores/instanceStore';

type InstanceStatus = 'connected' | 'connecting' | 'disconnected';

const statusConfig: Record<
  InstanceStatus,
  { dotClass: string; label: string }
> = {
  connected: { dotClass: 'bg-green-400', label: 'Connected' },
  connecting: { dotClass: 'bg-yellow-400 animate-pulse', label: 'Connecting...' },
  disconnected: { dotClass: 'bg-red-400', label: 'Offline — read-only' },
};

export function ConnectionStatusBar() {
  const navigate = useNavigate();
  const connectedInstanceId = useInstanceStore((s) => s.connectedInstanceId);
  const instanceStatus = useInstanceStore((s) => s.instanceStatus);
  const instances = useInstanceStore((s) => s.instances);

  const instance = instances.find((i) => i.id === connectedInstanceId);
  const instanceName = instance?.name ?? 'Unknown Instance';
  const { dotClass, label } = statusConfig[instanceStatus];

  const StatusIcon = instanceStatus === 'disconnected' ? FiWifiOff : FiWifi;

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-edge bg-surface px-3">
      {/* Status dot + icon */}
      <StatusIcon className="hidden h-3.5 w-3.5 text-muted sm:block" />
      <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />

      {/* Instance name + status label */}
      <span className="truncate text-sm font-medium text-primary">
        {instanceName}
      </span>
      <span className="hidden text-xs text-muted sm:inline">{label}</span>

      {/* Switch Instance */}
      <button
        type="button"
        onClick={() => navigate('/')}
        className="ml-auto flex cursor-pointer items-center gap-1 text-xs text-muted transition-colors hover:text-primary"
      >
        <FiChevronLeft className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Switch Instance</span>
      </button>
    </div>
  );
}
