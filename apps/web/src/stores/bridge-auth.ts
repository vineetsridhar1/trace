import { create } from "zustand";
import type { BridgeAccessAction } from "../lib/bridge-access-error";

interface ActiveChallenge {
  runtimeId: string;
  runtimeLabel: string;
  action: BridgeAccessAction;
  sessionId: string | null;
  promptPreview: string | null;
  retryAction: () => Promise<void>;
}

interface BridgeAuthState {
  activeChallenge: ActiveChallenge | null;
  showDialog: boolean;
  /** Verified challenge ID for start-session flows, consumed as bridgeAccessToken. */
  verifiedChallengeId: string | null;
  openChallenge: (challenge: Omit<ActiveChallenge, "retryAction">, retryAction: () => Promise<void>) => void;
  closeChallenge: () => void;
  setVerifiedChallengeId: (id: string) => void;
  consumeVerifiedChallengeId: () => string | null;
}

export const useBridgeAuthStore = create<BridgeAuthState>((set, get) => ({
  activeChallenge: null,
  showDialog: false,
  verifiedChallengeId: null,
  openChallenge: (challenge, retryAction) =>
    set({
      activeChallenge: { ...challenge, retryAction },
      showDialog: true,
    }),
  closeChallenge: () =>
    set({
      activeChallenge: null,
      showDialog: false,
    }),
  setVerifiedChallengeId: (id) => set({ verifiedChallengeId: id }),
  consumeVerifiedChallengeId: () => {
    const id = get().verifiedChallengeId;
    if (id) set({ verifiedChallengeId: null });
    return id;
  },
}));
