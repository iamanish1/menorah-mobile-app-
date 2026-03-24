import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, isToday, isYesterday } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatChatTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date))     return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'dd MMM');
}

export function formatMessageTime(dateStr: string): string {
  return format(new Date(dateStr), 'HH:mm');
}

export function formatRelativeTime(dateStr: string): string {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

export function formatBookingDate(dateStr: string): string {
  return format(new Date(dateStr), 'EEE, dd MMM yyyy • HH:mm');
}

export function formatCurrency(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'pending':     return 'bg-yellow-100 text-yellow-700';
    case 'confirmed':   return 'bg-blue-100 text-blue-700';
    case 'in-progress': return 'bg-primary-100 text-primary-700';
    case 'completed':   return 'bg-gray-100 text-gray-600';
    case 'cancelled':   return 'bg-red-100 text-red-700';
    case 'no-show':     return 'bg-orange-100 text-orange-700';
    default:            return 'bg-gray-100 text-gray-600';
  }
}

export function getSubscriptionBadgeColor(plan: string): string {
  switch (plan) {
    case 'premium': return 'bg-accent-100 text-accent-700';
    case 'basic':   return 'bg-primary-100 text-primary-700';
    default:        return 'bg-gray-100 text-gray-600';
  }
}

export function buildAvatarUrl(name: string): string {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=3d9470&textColor=ffffff`;
}

export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}
