import { useState, useCallback } from "react";
import { FiX, FiLock } from "react-icons/fi";
import { useInstance } from "../context/InstanceContext";
import type { ElectronInstance } from "../stores/instanceStore";

interface InstancePasswordModalProps {
  instance: ElectronInstance;
  onClose: () => void;
  onSuccess: (instanceId: string) => void;
}

export function InstancePasswordModal({
  instance,
  onClose,
  onSuccess,
}: InstancePasswordModalProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const { connectToInstance } = useInstance();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!password.trim()) return;

      setConnecting(true);
      setError(null);
      try {
        await connectToInstance(instance.id, password);
        onSuccess(instance.id);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Incorrect password",
        );
      } finally {
        setConnecting(false);
      }
    },
    [password, instance.id, connectToInstance, onSuccess],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[400px] rounded-lg border border-edge bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <div className="flex items-center gap-2">
            <FiLock className="h-3.5 w-3.5 text-muted" />
            <h2 className="text-sm font-semibold text-primary">
              Enter Password
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-primary"
          >
            <FiX className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="px-5 py-4"
        >
          <p className="mb-3 text-xs text-muted">
            <span className="font-medium text-primary">
              {instance.name}
            </span>{" "}
            requires a password to connect.
          </p>

          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            placeholder="Password"
            autoFocus
            className="w-full rounded border border-edge bg-surface-deep px-3 py-1.5 text-sm text-primary placeholder-faint outline-none focus:border-edge-hover"
          />

          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost rounded px-3 py-1.5 text-xs text-muted hover:text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={connecting || !password.trim()}
              className="btn-primary rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              {connecting ? "Connecting..." : "Connect"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
