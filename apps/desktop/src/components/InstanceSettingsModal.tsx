import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { FiX, FiLock, FiSettings } from "react-icons/fi";

export function InstanceSettingsModal({ onClose }: { onClose: () => void }) {
  const [instanceName, setInstanceName] = useState("");
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void window.traceAPI.instanceGetName().then(setInstanceName);
  }, []);

  const handleSaveName = useCallback(async () => {
    if (!instanceName.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await window.traceAPI.instanceSetName(instanceName.trim());
      setSuccess("Instance name updated.");
    } catch {
      setError("Failed to update instance name.");
    } finally {
      setSaving(false);
    }
  }, [instanceName]);

  const handleSetPassword = useCallback(async () => {
    if (!password.trim()) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await window.traceAPI.instanceSetPassword(password);
      if (!result.success) {
        setError(result.error ?? "Failed to set password.");
      } else {
        setHasPassword(true);
        setPassword("");
        setSuccess("Password set. Other users will need it to connect.");
      }
    } catch {
      setError("Failed to set password.");
    } finally {
      setSaving(false);
    }
  }, [password]);

  const handleRemovePassword = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await window.traceAPI.instanceSetPassword(null);
      if (!result.success) {
        setError(result.error ?? "Failed to remove password.");
      } else {
        setHasPassword(false);
        setSuccess("Password removed. Anyone can connect now.");
      }
    } catch {
      setError("Failed to remove password.");
    } finally {
      setSaving(false);
    }
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[420px] rounded-lg border border-edge bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <div className="flex items-center gap-2">
            <FiSettings className="h-3.5 w-3.5 text-muted" />
            <h2 className="text-sm font-semibold text-primary">
              Instance Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-primary"
          >
            <FiX className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {/* Instance Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">
              Instance Name
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                className="flex-1 rounded border border-edge bg-surface-deep px-3 py-1.5 text-sm text-primary placeholder-faint outline-none focus:border-edge-hover"
                placeholder="My Machine"
              />
              <button
                type="button"
                disabled={saving || !instanceName.trim()}
                onClick={() => void handleSaveName()}
                className="btn-primary rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
              <FiLock className="h-3 w-3" />
              Connection Password
            </label>
            <p className="mb-2 text-xs text-muted">
              {hasPassword
                ? "A password is set. Other users must enter it to connect to this instance."
                : "No password set. Set one to require authentication from other users."}
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                  setSuccess(null);
                }}
                className="flex-1 rounded border border-edge bg-surface-deep px-3 py-1.5 text-sm text-primary placeholder-faint outline-none focus:border-edge-hover"
                placeholder={hasPassword ? "New password" : "Set a password"}
              />
              <button
                type="button"
                disabled={saving || !password.trim()}
                onClick={() => void handleSetPassword()}
                className="btn-primary rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50"
              >
                {hasPassword ? "Update" : "Set"}
              </button>
            </div>
            {hasPassword && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleRemovePassword()}
                className="mt-2 text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
              >
                Remove password
              </button>
            )}
          </div>

          {/* Feedback */}
          {error && <p className="text-xs text-red-400">{error}</p>}
          {success && <p className="text-xs text-green-400">{success}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
