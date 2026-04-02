import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useBridgeAuthStore } from "@/stores/bridge-auth";
import { client } from "@/lib/urql";
import {
  CREATE_BRIDGE_ACCESS_CHALLENGE_MUTATION,
  VERIFY_BRIDGE_ACCESS_CODE_MUTATION,
} from "@/lib/mutations";
import { toast } from "sonner";

export function BridgeAccessDialog() {
  const { activeChallenge, showDialog, closeChallenge, setVerifiedChallengeId } =
    useBridgeAuthStore();
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [digits, setDigits] = useState(["", ""]);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const input0Ref = useRef<HTMLInputElement>(null);
  const input1Ref = useRef<HTMLInputElement>(null);

  const createChallenge = useCallback(async () => {
    if (!activeChallenge) return;
    setCreating(true);
    setError(null);
    setDigits(["", ""]);
    try {
      const result = await client
        .mutation(CREATE_BRIDGE_ACCESS_CHALLENGE_MUTATION, {
          runtimeId: activeChallenge.runtimeId,
          sessionId: activeChallenge.sessionId ?? undefined,
          action: activeChallenge.action,
          promptPreview: activeChallenge.promptPreview ?? undefined,
        })
        .toPromise();
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setChallengeId(result.data?.createBridgeAccessChallenge?.challengeId ?? null);
      // Focus first input
      setTimeout(() => input0Ref.current?.focus(), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create challenge");
    } finally {
      setCreating(false);
    }
  }, [activeChallenge]);

  // Auto-create challenge when dialog opens
  useEffect(() => {
    if (showDialog && activeChallenge && !challengeId) {
      void createChallenge();
    }
  }, [showDialog, activeChallenge, challengeId, createChallenge]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!showDialog) {
      setChallengeId(null);
      setDigits(["", ""]);
      setError(null);
      setVerifying(false);
      setCreating(false);
    }
  }, [showDialog]);

  const handleDigitChange = (index: number, value: string) => {
    // Only allow single digits
    const digit = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    setError(null);

    // Auto-advance to next input
    if (digit && index === 0) {
      input1Ref.current?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      input0Ref.current?.focus();
    }
    if (e.key === "Enter" && digits[0] && digits[1]) {
      void handleVerify();
    }
  };

  const handleVerify = async () => {
    if (!challengeId || !digits[0] || !digits[1]) return;
    setVerifying(true);
    setError(null);
    try {
      const code = `${digits[0]}${digits[1]}`;
      const result = await client
        .mutation(VERIFY_BRIDGE_ACCESS_CODE_MUTATION, { challengeId, code })
        .toPromise();

      if (result.error) {
        setError(result.error.message);
        setDigits(["", ""]);
        input0Ref.current?.focus();

        // If challenge expired from too many attempts, auto-create a new one
        if (result.error.message.includes("Too many failed attempts")) {
          setChallengeId(null);
          void createChallenge();
        }
        return;
      }

      if (result.data?.verifyBridgeAccessCode?.granted) {
        toast.success("Bridge access verified");
        if (!result.data.verifyBridgeAccessCode.sessionId) {
          setVerifiedChallengeId(challengeId);
        }
        const retryAction = activeChallenge?.retryAction;
        closeChallenge();
        if (retryAction) {
          void retryAction();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Dialog open={showDialog} onOpenChange={(open) => !open && closeChallenge()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Bridge Verification</DialogTitle>
          <DialogDescription>
            This bridge belongs to another user. Ask them for the 2-digit
            verification code.
          </DialogDescription>
        </DialogHeader>

        {activeChallenge && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Bridge: <span className="font-medium text-foreground">{activeChallenge.runtimeLabel}</span>
            </p>

            {creating ? (
              <p className="text-sm text-muted-foreground">Requesting verification code...</p>
            ) : (
              <>
                <div className="flex items-center justify-center gap-3">
                  <input
                    ref={input0Ref}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digits[0]}
                    onChange={(e) => handleDigitChange(0, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(0, e)}
                    className="h-16 w-14 rounded-lg border border-border bg-surface-deep text-center text-3xl font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                    disabled={verifying}
                  />
                  <input
                    ref={input1Ref}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digits[1]}
                    onChange={(e) => handleDigitChange(1, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(1, e)}
                    className="h-16 w-14 rounded-lg border border-border bg-surface-deep text-center text-3xl font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                    disabled={verifying}
                  />
                </div>

                {error && (
                  <p className="text-sm text-destructive text-center">{error}</p>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => closeChallenge()}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleVerify}
                    disabled={!digits[0] || !digits[1] || verifying}
                  >
                    {verifying ? "Verifying..." : "Verify"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
