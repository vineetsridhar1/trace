import { useCallback, useEffect, useRef, useState } from 'react';
import { useThreadStore } from '../stores/threadStore';

const THREAD_NEAR_BOTTOM_THRESHOLD_PX = 100;
const THREAD_NEAR_TOP_THRESHOLD_PX = 100;

export function useThreadScroll() {
  const sessionEvents = useThreadStore((s) => s.sessionEvents);
  const selectedWorkspaceId = useThreadStore((s) => s.selectedWorkspaceId);
  const hasMoreEvents = useThreadStore((s) => s.sessionTotal > s.sessionEvents.length);
  const loadingOlderEvents = useThreadStore((s) => s.loadingOlderEvents);

  const threadContentRef = useRef<HTMLDivElement | null>(null);
  const threadNearBottomRef = useRef(true);
  const prevThreadEventCountRef = useRef(0);
  const mountedWorkspaceRef = useRef<string | null>(null);
  const isPrependingRef = useRef(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const isThreadNearBottom = useCallback((): boolean => {
    const el = threadContentRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < THREAD_NEAR_BOTTOM_THRESHOLD_PX;
  }, []);

  const scrollThreadToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = threadContentRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    threadNearBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  // Scroll to bottom only when a NEW thread is opened (not on every re-render)
  useEffect(() => {
    if (!selectedWorkspaceId) return;
    if (mountedWorkspaceRef.current === selectedWorkspaceId) return;
    mountedWorkspaceRef.current = selectedWorkspaceId;
    // Reset state for new thread
    threadNearBottomRef.current = true;
    prevThreadEventCountRef.current = 0;
    setShowJumpToLatest(false);
    const timer = setTimeout(() => scrollThreadToBottom('auto'), 50);
    return () => clearTimeout(timer);
  }, [selectedWorkspaceId, scrollThreadToBottom]);

  // Auto-scroll when new events arrive, but only if user is near the bottom
  useEffect(() => {
    // Skip scroll logic when we're prepending older events
    if (isPrependingRef.current) return;

    const previousCount = prevThreadEventCountRef.current;
    const nextCount = sessionEvents.length;
    const hasNew = nextCount > previousCount;
    prevThreadEventCountRef.current = nextCount;

    if (!hasNew) return;

    // First load for this thread — always scroll to bottom
    if (previousCount === 0) {
      requestAnimationFrame(() => scrollThreadToBottom('auto'));
      return;
    }

    // Only auto-scroll if user is near the bottom
    if (threadNearBottomRef.current) {
      requestAnimationFrame(() => {
        if (threadNearBottomRef.current) {
          scrollThreadToBottom('auto');
        } else {
          setShowJumpToLatest(true);
        }
      });
      return;
    }

    setShowJumpToLatest(true);
  }, [sessionEvents, scrollThreadToBottom]);

  const onThreadScroll = useCallback(() => {
    const el = threadContentRef.current;
    if (!el) return;

    const nearBottom = isThreadNearBottom();
    threadNearBottomRef.current = nearBottom;
    if (nearBottom) setShowJumpToLatest(false);

    // Trigger loading older events when scrolled near the top
    if (el.scrollTop < THREAD_NEAR_TOP_THRESHOLD_PX && hasMoreEvents && !loadingOlderEvents) {
      const prevScrollHeight = el.scrollHeight;
      isPrependingRef.current = true;

      const loadOlderEvents = useThreadStore.getState().syncActions.loadOlderEvents;
      void loadOlderEvents().then((count) => {
        if (count > 0) {
          // Preserve scroll position after older events are prepended
          requestAnimationFrame(() => {
            const newScrollHeight = el.scrollHeight;
            el.scrollTop += newScrollHeight - prevScrollHeight;
            // Update the event count ref to avoid triggering auto-scroll
            prevThreadEventCountRef.current = prevThreadEventCountRef.current + count;
            isPrependingRef.current = false;
          });
        } else {
          isPrependingRef.current = false;
        }
      });
    }
  }, [isThreadNearBottom, hasMoreEvents, loadingOlderEvents]);

  const resetScroll = useCallback(() => {
    setShowJumpToLatest(false);
    threadNearBottomRef.current = true;
    prevThreadEventCountRef.current = 0;
    mountedWorkspaceRef.current = null;
    isPrependingRef.current = false;
  }, []);

  return {
    threadContentRef,
    showJumpToLatest,
    scrollThreadToBottom,
    onThreadScroll,
    resetScroll,
  };
}
