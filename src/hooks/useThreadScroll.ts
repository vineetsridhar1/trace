import { useCallback, useEffect, useRef, useState } from 'react';
import type { ServerEvent } from '../types';

const THREAD_NEAR_BOTTOM_THRESHOLD_PX = 100;

export function useThreadScroll(threadEvents: ServerEvent[], selectedMessageId: string | null) {
  const threadContentRef = useRef<HTMLDivElement | null>(null);
  const threadNearBottomRef = useRef(true);
  const prevThreadEventCountRef = useRef(0);
  const mountedMessageRef = useRef<string | null>(null);
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
    if (!selectedMessageId) return;
    if (mountedMessageRef.current === selectedMessageId) return;
    mountedMessageRef.current = selectedMessageId;
    // Reset state for new thread
    threadNearBottomRef.current = true;
    prevThreadEventCountRef.current = 0;
    setShowJumpToLatest(false);
    const timer = setTimeout(() => scrollThreadToBottom('auto'), 50);
    return () => clearTimeout(timer);
  }, [selectedMessageId, scrollThreadToBottom]);

  // Auto-scroll when new events arrive, but only if user is near the bottom
  useEffect(() => {
    const previousCount = prevThreadEventCountRef.current;
    const nextCount = threadEvents.length;
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
  }, [threadEvents, scrollThreadToBottom]);

  const onThreadScroll = useCallback(() => {
    const nearBottom = isThreadNearBottom();
    threadNearBottomRef.current = nearBottom;
    if (nearBottom) setShowJumpToLatest(false);
  }, [isThreadNearBottom]);

  const resetScroll = useCallback(() => {
    setShowJumpToLatest(false);
    threadNearBottomRef.current = true;
    prevThreadEventCountRef.current = 0;
    mountedMessageRef.current = null;
  }, []);

  return {
    threadContentRef,
    showJumpToLatest,
    scrollThreadToBottom,
    onThreadScroll,
    resetScroll,
  };
}
