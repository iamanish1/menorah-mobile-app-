import { api } from './api';
import { isSafeNavigationIdentifier } from './deepLinks';

export async function resolveBookingChatRoomId(bookingId: string): Promise<string> {
  if (!isSafeNavigationIdentifier(bookingId)) {
    throw new Error('Invalid booking identifier');
  }

  const response = await api.getBooking(bookingId);
  const roomId = response.data?.booking?.chat?.roomId;
  if (!response.success || !isSafeNavigationIdentifier(roomId)) {
    throw new Error('The session conversation is not available yet');
  }

  return roomId;
}
