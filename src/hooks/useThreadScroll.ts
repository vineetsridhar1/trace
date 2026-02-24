import { useCallback, useEffect, useRef, useState } from 'react';
import type { ServerEvent } from '../types';

const THREAD_NEAR_BOTTOM_THRESHOLD_PX = 72;

export function useThreadScroll(threadEvents: ServerEvent[], selectedMessageId: string | null) {
  const threadContentRef = useRef<HTMLDivElement | null>(null);
  const threadNearBottomRef = useRef(true);
  const prevThreadEventCountRef = useRef(0);
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

  // Scroll to bottom when a thread is first opened
  useEffect(() => {
    if (!selectedMessageId) return;
    // Use a short delay to ensure the scroll container is mounted and laid out
    const timer = setTimeout(() => scrollThreadToBottom('auto'), 50);
    return () => clearTimeout(timer);
  }, [selectedMessageId, scrollThreadToBottom]);

  useEffect(() => {
    const previousCount = prevThreadEventCountRef.current;
    const nextCount = threadEvents.length;
    const hasNew = nextCount > previousCount;
    prevThreadEventCountRef.current = nextCount;

    if (!hasNew) return;

    if (previousCount === 0) {
      requestAnimationFrame(() => scrollThreadToBottom('auto'));
      return;
    }

    // Re-check near-bottom inside rAF so we don't override a user scroll-up
    // that happened between the state update and the paint
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
  }, []);

  return {
    threadContentRef,
    showJumpToLatest,
    scrollThreadToBottom,
    onThreadScroll,
    resetScroll,
  };
}
