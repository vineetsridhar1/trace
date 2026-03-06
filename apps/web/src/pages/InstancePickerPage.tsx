import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { gql } from "@apollo/client";
import { FiMonitor, FiWifi, FiWifiOff } from "react-icons/fi";
import { useMyInstancesQuery } from "./__generated__/InstancePickerPage.generated";
import { useInstance } from "../context/InstanceContext";
import {
  useInstanceStore,
  type ElectronInstance,
} from "../stores/instanceStore";
import { InstancePasswordModal } from "../components/InstancePasswordModal";

const GQL_MY_INSTANCES = gql`
  query MyInstances {
    myInstances {
      id
      name
      serverId
      hasPassword
      isOnline
      owner {
        id
        name
        avatarUrl
      }
    }
  }
`;

export function InstancePickerPage() {
  const navigate = useNavigate();
  const { data, loading } = useMyInstancesQuery();
  const { connectToInstance } = useInstance();
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [passwordInstance, setPasswordInstance] =
    useState<ElectronInstance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data?.myInstances) {
      useInstanceStore.getState().setInstances(data.myInstances);
    }
  }, [data]);

  const handleConnect = useCallback(
    async (instance: ElectronInstance) => {
      if (!instance.isOnline) return;

      const isAuthorized = useInstanceStore
        .getState()
        .authorizedInstanceIds.has(instance.id);

      if (instance.hasPassword && !isAuthorized) {
        setPasswordInstance(instance);
        return;
      }

      setConnectingId(instance.id);
      setError(null);
      try {
        await connectToInstance(instance.id);
        navigate(`/i/${instance.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to connect");
      } finally {
        setConnectingId(null);
      }
    },
    [connectToInstance, navigate],
  );

  const handlePasswordSuccess = useCallback(
    (instanceId: string) => {
      setPasswordInstance(null);
      navigate(`/i/${instanceId}`);
    },
    [navigate],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        Loading instances...
      </div>
    );
  }

  const instances = data?.myInstances ?? [];

  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        <h1 className="mb-6 text-lg font-semibold text-primary">
          Connect to Instance
        </h1>

        {error && (
          <div className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {instances.length === 0 ? (
          <div className="rounded-lg border border-edge bg-surface-deep p-8 text-center text-sm text-muted">
            No instances available
          </div>
        ) : (
          <div className="grid gap-3">
            {instances.map((instance) => {
              const isConnecting = connectingId === instance.id;

              return (
                <div
                  key={instance.id}
                  className="flex items-center justify-between rounded-lg border border-edge bg-surface p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-elevated">
                      <FiMonitor className="h-4 w-4 text-muted" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-primary">
                        {instance.name}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted">
                        {instance.owner.avatarUrl ? (
                          <img
                            src={instance.owner.avatarUrl}
                            alt=""
                            className="h-3.5 w-3.5 rounded-full"
                          />
                        ) : null}
                        <span>{instance.owner.name}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`flex items-center gap-1 text-xs ${
                        instance.isOnline ? "text-green-400" : "text-muted"
                      }`}
                    >
                      {instance.isOnline ? (
                        <FiWifi className="h-3 w-3" />
                      ) : (
                        <FiWifiOff className="h-3 w-3" />
                      )}
                      {instance.isOnline ? "Online" : "Offline"}
                    </span>

                    <button
                      type="button"
                      onClick={() => void handleConnect(instance)}
                      disabled={!instance.isOnline || isConnecting}
                      className="btn-primary rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    >
                      {isConnecting ? "Connecting..." : "Connect"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {passwordInstance && (
        <InstancePasswordModal
          instance={passwordInstance}
          onClose={() => setPasswordInstance(null)}
          onSuccess={handlePasswordSuccess}
        />
      )}
    </div>
  );
}
