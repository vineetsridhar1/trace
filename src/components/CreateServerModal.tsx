import { useState, useCallback } from 'react';
import { useMutation } from 'urql';
import { CREATE_SERVER_MUTATION } from '../graphql/documents/servers';

interface CreateServerModalProps {
  onClose: () => void;
  onCreated: (server: { id: string; channels: { id: string }[] }) => void;
}

export function CreateServerModal({ onClose, onCreated }: CreateServerModalProps) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, executeCreateServer] = useMutation(CREATE_SERVER_MUTATION);

  const handleCreate = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setCreating(true);
    setError(null);
    try {
      const result = await executeCreateServer({ name: trimmedName });
      if (result.error) {
        setError(result.error.message || 'Failed to create server');
        return;
      }
      onCreated(result.data.createServer);
    } catch {
      setError('Failed to create server');
    } finally {
      setCreating(false);
    }
  }, [name, onCreated, executeCreateServer]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[420px] rounded-lg border border-[#292e42] bg-[#1a1b26] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#292e42] px-5 py-3">
          <h2 className="text-sm font-semibold text-[#c0caf5]">Create Server</h2>
          <button type="button" onClick={onClose} className="text-[#565f89] hover:text-[#c0caf5]">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#565f89]">Server Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) void handleCreate();
              }}
              placeholder="My Server"
              autoFocus
              className="w-full rounded border border-[#292e42] bg-[#16161e] px-3 py-1.5 text-sm text-[#c0caf5] placeholder-[#3b4261] outline-none focus:border-[#7aa2f7]"
            />
          </div>

          {error && (
            <p className="text-xs text-[#f7768e]">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#292e42] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-[#565f89] hover:bg-[#292e42] hover:text-[#c0caf5]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || !name.trim()}
            className="rounded bg-[#7aa2f7] px-3 py-1.5 text-xs font-medium text-[#1a1b26] hover:bg-[#89b4fa] disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
