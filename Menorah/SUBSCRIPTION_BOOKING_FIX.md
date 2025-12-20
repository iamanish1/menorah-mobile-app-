# Subscription Booking Feature Implementation

## Overview
Implemented subscription-based booking functionality that allows users with active subscriptions (weekly, monthly, or yearly) to book sessions without payment. These bookings are clearly marked as "subscription bookings" on the counsellor dashboard.

## Changes Made

### 1. Backend Changes

#### Booking Model (`backend/src/models/Booking.js`)
- Added `isSubscriptionBooking` field (Boolean, default: false)
- Updated `paymentMethod` enum to include 'subscription'

#### Booking Creation Route (`backend/src/routes/bookings.js`)
- Added User model import
- Checks user's subscription status before creating booking
- If subscription is active:
  - Sets `isSubscriptionBooking = true`
  - Sets `paymentStatus = 'paid'`
  - Sets `paymentMethod = 'subscription'`
  - Sets `amount = 0`
- If no active subscription, booking is created normally with payment required

#### Counsellor Booking Routes (`backend/src/routes/counsellor-bookings.js`)
- Updated all booking response formats to include:
  - `isSubscriptionBooking` field
  - `paymentMethod` field
- Updated pending bookings endpoint
- Updated assigned bookings endpoint
- Updated dashboard endpoint (todaySchedule and recentBookings)

### 2. Mobile App Changes

#### Session Review Screen (`mobile-app/src/screens/booking/SessionReview.tsx`)
- Added subscription service import
- Added `useEffect` to check subscription status on component mount
- Updated `handlePayment` function to:
  - Check if booking was created as subscription booking
  - If subscription booking: Show success message and navigate to bookings
  - If regular booking: Navigate to payment screen as before

### 3. Web App Changes

#### Types (`web-app/src/types/index.ts`)
- Updated `Booking` interface to include:
  - `paymentMethod?: 'stripe' | 'razorpay' | 'wallet' | 'subscription'`
  - `isSubscriptionBooking?: boolean`

#### Bookings Page (`web-app/src/app/bookings/page.tsx`)
- Added subscription badge next to status badge for subscription bookings
- Updated amount display to show "Subscription" instead of amount for subscription bookings
- Added shield icon for subscription bookings

## How It Works

### For Users with Active Subscription:
1. User selects session type and duration
2. User clicks "Book Session"
3. Backend checks subscription status:
   - If active: Creates booking with `isSubscriptionBooking = true`, `paymentStatus = 'paid'`
   - If inactive: Creates booking normally, requires payment
4. Mobile app checks booking response:
   - If subscription booking: Shows success message, no payment required
   - If regular booking: Navigates to payment screen

### For Counsellors:
1. Counsellor views dashboard/bookings
2. Subscription bookings are clearly marked with:
   - "Subscription" badge next to user name
   - "Subscription" label instead of amount
   - Shield icon indicating subscription payment
3. Counsellor can see all booking details as normal

## Testing Checklist

### Backend:
- [ ] Create booking with active subscription → Should create subscription booking
- [ ] Create booking without subscription → Should create regular booking requiring payment
- [ ] Check counsellor dashboard → Should show subscription bookings with badge
- [ ] Check pending bookings → Should show subscription status
- [ ] Check assigned bookings → Should show subscription status

### Mobile App:
- [ ] User with active subscription books session → Should skip payment, show success
- [ ] User without subscription books session → Should navigate to payment
- [ ] Check booking list → Subscription bookings should show correctly

### Web App:
- [ ] Counsellor views bookings → Should see subscription badge
- [ ] Subscription bookings show "Subscription" instead of amount
- [ ] All booking details are visible

## Database Migration

The Booking model has been updated with new fields. Existing bookings will have:
- `isSubscriptionBooking: false` (default)
- `paymentMethod: 'razorpay'` or existing value

No migration script needed as Mongoose will handle the new fields automatically.

## API Response Changes

### Booking Response Now Includes:
```json
{
  "id": "...",
  "isSubscriptionBooking": true,
  "paymentMethod": "subscription",
  "paymentStatus": "paid",
  "amount": 0,
  ...
}
```

### Counsellor Dashboard Response:
```json
{
  "todaySchedule": [
    {
      "id": "...",
      "isSubscriptionBooking": true,
      "paymentMethod": "subscription",
      ...
    }
  ],
  "recentBookings": [
    {
      "isSubscriptionBooking": true,
      "paymentMethod": "subscription",
      ...
    }
  ]
}
```

## Notes

- Subscription status is checked at booking creation time
- If subscription expires between booking creation and session, booking remains valid
- Subscription bookings have `amount = 0` but still track session duration and type
- Counsellors can see all booking details regardless of payment method
- Subscription bookings are treated the same as paid bookings for session management

