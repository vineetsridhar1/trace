import { useCallback, useEffect, useRef, useState } from "react";
import { clamp } from "../lib/utils";
import { getTabFromProgress, getTabIndex, type SidebarTab } from "../components/sidebar/sidebarTabs";

/**
 * Scroll-end detection timeout for browsers that don't support the `scrollend`
 * event. After this many ms of no `scroll` events, we treat scrolling as done.
 */
const SCROLL_END_TIMEOUT_MS = 150;

export function useSidebarTabScroll({
  currentTab,
  onProgressChange,
  onTabCommit,
}: {
  currentTab: SidebarTab;
  onProgressChange?: (progress: number) => void;
  onTabCommit?: (tab: SidebarTab) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(getTabIndex(currentTab));
  const [tabProgress, setTabProgressState] = useState(getTabIndex(currentTab));
  const hasInitRef = useRef(false);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const setProgress = useCallback((p: number) => {
    const clamped = clamp(p, 0, 1);
    progressRef.current = clamped;
    setTabProgressState(clamped);
    onProgressChange?.(clamped);
  }, [onProgressChange]);

  // Called when scrolling settles — commit to nearest tab
  const commitPosition = useCallback(() => {
    const tab = getTabFromProgress(progressRef.current);
    onTabCommit?.(tab);
    setProgress(getTabIndex(tab));
  }, [onTabCommit, setProgress]);

  // Track scroll progress for background color blending
  const handleScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setProgress(viewport.scrollLeft / Math.max(viewport.clientWidth, 1));

    // Fallback scroll-end detection via timeout (for Safari < 18 etc.)
    clearTimeout(scrollEndTimerRef.current);
    scrollEndTimerRef.current = setTimeout(commitPosition, SCROLL_END_TIMEOUT_MS);
  }, [setProgress, commitPosition]);

  // Use native scrollend event where supported (fires reliably after CSS snap settles)
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onScrollEnd = () => {
      clearTimeout(scrollEndTimerRef.current);
      commitPosition();
    };

    viewport.addEventListener("scrollend", onScrollEnd);
    return () => viewport.removeEventListener("scrollend", onScrollEnd);
  }, [commitPosition]);

  // Instant jump — used for init, resize, and external tab changes
  const jumpToTab = useCallback((tab: SidebarTab) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = getTabIndex(tab) * viewport.clientWidth;
    setProgress(getTabIndex(tab));
  }, [setProgress]);

  // Animated switch — used when user clicks the tab switcher
  const selectTab = useCallback((tab: SidebarTab) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ left: getTabIndex(tab) * viewport.clientWidth, behavior: "smooth" });
  }, []);

  // Sync scroll position when currentTab changes externally
  useEffect(() => {
    if (!hasInitRef.current) {
      jumpToTab(currentTab);
      hasInitRef.current = true;
      return;
    }
    jumpToTab(currentTab);
  }, [currentTab, jumpToTab]);

  // Re-snap to current tab on resize
  useEffect(() => {
    const handleResize = () => jumpToTab(currentTab);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [currentTab, jumpToTab]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => clearTimeout(scrollEndTimerRef.current);
  }, []);

  return { handleScroll, jumpToTab, selectTab, tabProgress, viewportRef };
}
