import { create } from "zustand";

export interface ElectronInstance {
  id: string;
  name: string;
  serverId: string;
  hasPassword: boolean;
  isOnline: boolean;
  owner: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  };
}

export interface InstanceChannel {
  id: string;
  name: string;
  type: string;
  baseBranch: string | null;
  repoPath: string | null;
}

interface InstanceState {
  connectedInstanceId: string | null;
  connectedServerId: string | null;
  instanceStatus: "connected" | "connecting" | "disconnected";
  instances: ElectronInstance[];
  authorizedInstanceIds: Set<string>;
  channels: InstanceChannel[];
  selectedChannelId: string | null;

  setConnectedInstance: (id: string | null) => void;
  setConnectedServerId: (id: string | null) => void;
  setInstanceStatus: (status: InstanceState["instanceStatus"]) => void;
  setInstances: (instances: ElectronInstance[]) => void;
  addAuthorizedInstance: (id: string) => void;
  setChannels: (channels: InstanceChannel[]) => void;
  setSelectedChannelId: (id: string | null) => void;
}

export const useInstanceStore = create<InstanceState>((set) => ({
  connectedInstanceId: null,
  connectedServerId: null,
  instanceStatus: "disconnected",
  instances: [],
  authorizedInstanceIds: new Set(),
  channels: [],
  selectedChannelId: null,

  setConnectedInstance: (id) => set({ connectedInstanceId: id }),
  setConnectedServerId: (id) => set({ connectedServerId: id }),
  setInstanceStatus: (status) => set({ instanceStatus: status }),
  setInstances: (instances) => set({ instances }),
  addAuthorizedInstance: (id) =>
    set((state) => {
      if (state.authorizedInstanceIds.has(id)) return state;
      const next = new Set(state.authorizedInstanceIds);
      next.add(id);
      return { authorizedInstanceIds: next };
    }),
  setChannels: (channels) =>
    set((state) => ({
      channels,
      selectedChannelId: state.selectedChannelId ?? (channels[0]?.id ?? null),
    })),
  setSelectedChannelId: (id) => set({ selectedChannelId: id }),
}));
