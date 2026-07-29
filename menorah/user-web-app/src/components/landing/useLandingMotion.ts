"use client";

import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

type ViewportSubscriber = () => void;

const viewportSubscribers = new Set<ViewportSubscriber>();
let viewportFrame = 0;
let viewportListenersAttached = false;
let observedVisualViewport: VisualViewport | null = null;

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
  if (viewportFrame) {
    return;
  }

  viewportFrame = requestViewportFrame(() => {
    viewportFrame = 0;
    [...viewportSubscribers].forEach((subscriber) => subscriber());
  });
}

function attachViewportListeners() {
  if (viewportListenersAttached) {
    return;
  }

  viewportListenersAttached = true;
  window.addEventListener("scroll", notifyViewportSubscribers, { passive: true });
  window.addEventListener("resize", notifyViewportSubscribers);

  observedVisualViewport = window.visualViewport;
  observedVisualViewport?.addEventListener("resize", notifyViewportSubscribers);
  observedVisualViewport?.addEventListener("scroll", notifyViewportSubscribers);
}

function detachViewportListeners() {
  if (!viewportListenersAttached) {
    return;
  }

  viewportListenersAttached = false;
  window.removeEventListener("scroll", notifyViewportSubscribers);
  window.removeEventListener("resize", notifyViewportSubscribers);
  observedVisualViewport?.removeEventListener("resize", notifyViewportSubscribers);
  observedVisualViewport?.removeEventListener("scroll", notifyViewportSubscribers);
  observedVisualViewport = null;

  if (viewportFrame) {
    cancelViewportFrame(viewportFrame);
    viewportFrame = 0;
  }
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
export function useScrollProgress(ref: RefObject<HTMLElement | null>, smoothing = 0.14) {
  const [progress, setProgress] = useState(0);
  const targetProgressRef = useRef(0);
  const displayedProgressRef = useRef(0);

  useEffect(() => {
    let measureFrame = 0;
    let animationFrame = 0;
    let resizeObserver: ResizeObserver | undefined;

    const animateProgress = () => {
      animationFrame = 0;
      const currentProgress = displayedProgressRef.current;
      const targetProgress = targetProgressRef.current;
      const remainingDistance = targetProgress - currentProgress;
      const nextProgress =
        Math.abs(remainingDistance) < 0.0005 ? targetProgress : currentProgress + remainingDistance * smoothing;

      displayedProgressRef.current = nextProgress;
      setProgress((current) => (Math.abs(current - nextProgress) > 0.0001 ? nextProgress : current));

      if (Math.abs(targetProgress - nextProgress) > 0.0005) {
        animationFrame = requestViewportFrame(animateProgress);
      }
    };

    const queueAnimation = () => {
      if (!animationFrame) {
        animationFrame = requestViewportFrame(animateProgress);
      }
    };

    const measure = () => {
      measureFrame = 0;
      const element = ref.current;

      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const travel = Math.max(rect.height - window.innerHeight, 1);
      const nextProgress = clamp(-rect.top / travel, 0, 1);

      if (Math.abs(targetProgressRef.current - nextProgress) > 0.0001) {
        targetProgressRef.current = nextProgress;
        queueAnimation();
      }
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

      if (animationFrame) {
        cancelViewportFrame(animationFrame);
      }

      resizeObserver?.disconnect();
      unsubscribe();
    };
  }, [ref, smoothing]);

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
