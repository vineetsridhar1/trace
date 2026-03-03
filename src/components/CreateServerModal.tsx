import { useState, useCallback } from 'react';
import { gql } from '@apollo/client';
import { useCreateServerMutation } from './__generated__/CreateServerModal.generated';

const GQL_CREATE_SERVER = gql`
  mutation CreateServer($name: String!, $avatarUrl: String) {
    createServer(name: $name, avatarUrl: $avatarUrl) {
      id
      name
      avatarUrl
      createdAt
      updatedAt
      channels {
        id
      }
    }
  }
`;

interface CreateServerModalProps {
  onClose: () => void;
  onCreated: (server: { id: string; channels: { id: string }[] }) => void;
}

export function CreateServerModal({ onClose, onCreated }: CreateServerModalProps) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executeCreateServer] = useCreateServerMutation();

  const handleCreate = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setCreating(true);
    setError(null);
    try {
      const { data, errors } = await executeCreateServer({ variables: { name: trimmedName } });
      if (errors?.length) {
        setError(errors[0].message || 'Failed to create server');
        return;
      }
      onCreated(data!.createServer);
    } catch {
      setError('Failed to create server');
    } finally {
      setCreating(false);
    }
  }, [name, onCreated, executeCreateServer]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[420px] rounded-lg border border-edge bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 className="text-sm font-semibold text-primary">Create Server</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-primary">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Server Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && name.trim()) void handleCreate();
              }}
              placeholder="My Server"
              autoFocus
              className="w-full rounded border border-edge bg-surface-deep px-3 py-1.5 text-sm text-primary placeholder-faint outline-none focus:border-accent"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-edge px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 text-xs text-muted hover:bg-surface-elevated hover:text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || !name.trim()}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-light disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
