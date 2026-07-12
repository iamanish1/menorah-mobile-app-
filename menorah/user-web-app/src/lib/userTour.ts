'use client';

export const USER_TOUR_STORAGE_KEY = 'menorah-user-tour-v2';
export const USER_TOUR_RESTART_EVENT = 'menorah:user-tour-restart';

export function restartUserTour() {
  try {
    window.localStorage.removeItem(USER_TOUR_STORAGE_KEY);
  } catch {
    // The tour can still restart for this page view if storage is unavailable.
  }

  window.dispatchEvent(new Event(USER_TOUR_RESTART_EVENT));
}
