import { redirect } from 'next/navigation';

// Keep existing bookmarks safe now that subscriptions are no longer offered
// through the web app.
export default function SubscriptionPage() {
  redirect('/discover');
}
