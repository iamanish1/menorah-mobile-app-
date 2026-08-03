"use client";

import type { RefObject } from "react";
import { useEffect, useState } from "react";

type ViewportSubscriber = () => void;

const viewportSubscribers = new Set<ViewportSubscriber>();
let viewportListenersAttached = false;
let observedVisualViewport: VisualViewport | null = null;
let observedDocumentScroller: Element | null = null;
let observedBodyScroller: HTMLElement | null = null;
let layoutObserver: ResizeObserver | undefined;
let layoutSettleFrame = 0;
let touchSettleFrame = 0;
let touchSettleIdleFrames = 0;
let touchSettleLastPosition = 0;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function requestViewportFrame(callback: FrameRequestCallback) {
  if (typeof window.requestAnimationFrame === "function") {
    return window.requestAnimationFrame(callback);
  }

  return window.setTimeout(() => callback(Date.now()), 16) as unknown as number;
}

function cancelViewportFrame(frame: number) {
  if (typeof window.cancelAnimationFrame === "function") {
    window.cancelAnimationFrame(frame);
    return;
  }

  window.clearTimeout(frame);
}

function notifyViewportSubscribers() {
  // Each subscriber queues its own animation-frame measurement. Calling it
  // directly avoids a second global frame that made scroll-controlled stages
  // visibly render the previous state while the page was moving.
  [...viewportSubscribers].forEach((subscriber) => subscriber());
}

function scheduleLayoutRecheck() {
  notifyViewportSubscribers();

  if (layoutSettleFrame) {
    return;
  }

  layoutSettleFrame = requestViewportFrame(() => {
    layoutSettleFrame = 0;
    notifyViewportSubscribers();
  });
}

function getDocumentScrollPosition() {
  return Math.max(
    window.scrollY || 0,
    window.pageYOffset || 0,
    document.scrollingElement?.scrollTop || 0,
    document.documentElement.scrollTop || 0,
    document.body?.scrollTop || 0
  );
}

// Some mobile WebKit contexts update the root scroller during a touch gesture
// without delivering window scroll events until after momentum has settled.
// Re-measure from the gesture itself, then follow the short inertial tail.
function scheduleTouchScrollRecheck() {
  notifyViewportSubscribers();
  touchSettleIdleFrames = 0;

  if (touchSettleFrame) {
    return;
  }

  touchSettleLastPosition = getDocumentScrollPosition();

  const settle = () => {
    notifyViewportSubscribers();
    const nextPosition = getDocumentScrollPosition();

    if (Math.abs(nextPosition - touchSettleLastPosition) > 0.5) {
      touchSettleLastPosition = nextPosition;
      touchSettleIdleFrames = 0;
    } else {
      touchSettleIdleFrames += 1;
    }

    if (touchSettleIdleFrames < 3) {
      touchSettleFrame = requestViewportFrame(settle);
      return;
    }

    touchSettleFrame = 0;
  };

  touchSettleFrame = requestViewportFrame(settle);
}

function attachViewportListeners() {
  if (viewportListenersAttached) {
    return;
  }

  viewportListenersAttached = true;
  window.addEventListener("scroll", notifyViewportSubscribers, { passive: true });
  window.addEventListener("resize", scheduleLayoutRecheck);
  window.addEventListener("load", scheduleLayoutRecheck);
  window.addEventListener("pageshow", scheduleLayoutRecheck);
  window.addEventListener("touchmove", scheduleTouchScrollRecheck, { passive: true });
  window.addEventListener("touchend", scheduleTouchScrollRecheck, { passive: true });
  window.addEventListener("touchcancel", scheduleTouchScrollRecheck, { passive: true });

  document.addEventListener("scroll", notifyViewportSubscribers, { passive: true });
  observedDocumentScroller = document.scrollingElement;
  observedDocumentScroller?.addEventListener("scroll", notifyViewportSubscribers, { passive: true });
  observedBodyScroller = document.body ?? null;
  if (observedBodyScroller && observedBodyScroller !== observedDocumentScroller) {
    observedBodyScroller.addEventListener("scroll", notifyViewportSubscribers, { passive: true });
  }

  observedVisualViewport = window.visualViewport;
  observedVisualViewport?.addEventListener("resize", scheduleLayoutRecheck);
  observedVisualViewport?.addEventListener("scroll", notifyViewportSubscribers);

  if (typeof ResizeObserver !== "undefined") {
    layoutObserver = new ResizeObserver(scheduleLayoutRecheck);
    layoutObserver.observe(document.documentElement);
    if (document.body) {
      layoutObserver.observe(document.body);
    }
  }

  // Font and image/layout hydration can shift a stage without emitting a
  // scroll event. Re-measure after the document finishes settling so a stage
  // never remains frozen at its pre-layout position.
  document.fonts?.ready.then(scheduleLayoutRecheck).catch(() => {});
  scheduleLayoutRecheck();
}

function detachViewportListeners() {
  if (!viewportListenersAttached) {
    return;
  }

  viewportListenersAttached = false;
  window.removeEventListener("scroll", notifyViewportSubscribers);
  window.removeEventListener("resize", scheduleLayoutRecheck);
  window.removeEventListener("load", scheduleLayoutRecheck);
  window.removeEventListener("pageshow", scheduleLayoutRecheck);
  window.removeEventListener("touchmove", scheduleTouchScrollRecheck);
  window.removeEventListener("touchend", scheduleTouchScrollRecheck);
  window.removeEventListener("touchcancel", scheduleTouchScrollRecheck);
  document.removeEventListener("scroll", notifyViewportSubscribers);
  observedDocumentScroller?.removeEventListener("scroll", notifyViewportSubscribers);
  if (observedBodyScroller && observedBodyScroller !== observedDocumentScroller) {
    observedBodyScroller.removeEventListener("scroll", notifyViewportSubscribers);
  }
  observedDocumentScroller = null;
  observedBodyScroller = null;
  observedVisualViewport?.removeEventListener("resize", scheduleLayoutRecheck);
  observedVisualViewport?.removeEventListener("scroll", notifyViewportSubscribers);
  observedVisualViewport = null;
  layoutObserver?.disconnect();
  layoutObserver = undefined;

  if (layoutSettleFrame) {
    cancelViewportFrame(layoutSettleFrame);
    layoutSettleFrame = 0;
  }

  if (touchSettleFrame) {
    cancelViewportFrame(touchSettleFrame);
    touchSettleFrame = 0;
  }
  touchSettleIdleFrames = 0;
}

function subscribeToViewportChanges(subscriber: ViewportSubscriber) {
  viewportSubscribers.add(subscriber);
  attachViewportListeners();

  return () => {
    viewportSubscribers.delete(subscriber);

    if (viewportSubscribers.size === 0) {
      detachViewportListeners();
    }
  };
}

function subscribeToMediaQuery(media: MediaQueryList, listener: (event: MediaQueryListEvent) => void) {
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }

  const legacyMedia = media as MediaQueryList & {
    addListener?: (callback: (event: MediaQueryListEvent) => void) => void;
    removeListener?: (callback: (event: MediaQueryListEvent) => void) => void;
  };

  legacyMedia.addListener?.(listener);
  return () => legacyMedia.removeListener?.(listener);
}

/**
 * Scroll progress for a section, with browser API fallbacks for older WebViews.
 * The one shared viewport listener prevents every landing section from adding its
 * own scroll and resize handlers.
 */
export function useScrollProgress(ref: RefObject<HTMLElement | null>, resetKey?: boolean) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let measureFrame = 0;
    let resizeObserver: ResizeObserver | undefined;

    const measure = () => {
      measureFrame = 0;
      const element = ref.current;

      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const travel = Math.max(rect.height - window.innerHeight, 1);
      const nextProgress = clamp(-rect.top / travel, 0, 1);
      setProgress((current) => (Math.abs(current - nextProgress) > 0.0001 ? nextProgress : current));
    };

    const queueMeasure = () => {
      if (!measureFrame) {
        measureFrame = requestViewportFrame(measure);
      }
    };

    const unsubscribe = subscribeToViewportChanges(queueMeasure);

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(queueMeasure);
      if (ref.current) {
        resizeObserver.observe(ref.current);
      }
    }

    queueMeasure();

    return () => {
      if (measureFrame) {
        cancelViewportFrame(measureFrame);
      }

      resizeObserver?.disconnect();
      unsubscribe();
    };
  }, [ref, resetKey]);

  return progress;
}

/** Keeps decorative reveal content visible when IntersectionObserver is unavailable. */
export function useInView(ref: RefObject<HTMLElement | null>, threshold = 0.24) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [ref, threshold]);

  return isVisible;
}

export function useElementProgress(ref: RefObject<HTMLElement | null>) {
  const [progress, setProgress] = useState(0.5);

  useEffect(() => {
    let measureFrame = 0;
    let resizeObserver: ResizeObserver | undefined;

    const measure = () => {
      measureFrame = 0;
      const element = ref.current;

      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const nextProgress = clamp((window.innerHeight - rect.top) / (window.innerHeight + rect.height), 0, 1);
      setProgress((current) => (Math.abs(current - nextProgress) > 0.001 ? nextProgress : current));
    };

    const queueMeasure = () => {
      if (!measureFrame) {
        measureFrame = requestViewportFrame(measure);
      }
    };

    const unsubscribe = subscribeToViewportChanges(queueMeasure);

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(queueMeasure);
      if (ref.current) {
        resizeObserver.observe(ref.current);
      }
    }

    queueMeasure();

    return () => {
      if (measureFrame) {
        cancelViewportFrame(measureFrame);
      }

      resizeObserver?.disconnect();
      unsubscribe();
    };
  }, [ref]);

  return progress;
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia(query);
    const updateMatch = () => setMatches(media.matches);

    updateMatch();
    return subscribeToMediaQuery(media, updateMatch);
  }, [query]);

  return matches;
}

export function usePrefersReducedMotion() {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
