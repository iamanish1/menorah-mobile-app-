'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { MessageCircle, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar, Spinner } from '@/components/ui';
import { formatChatTime, truncate } from '@/lib/utils';
import { useSocket } from '@/context/SocketContext';
import { useEffect, useState } from 'react';
import type { ChatRoom } from '@/types';

export default function ChatListPage() {
  const router = useRouter();
  const { socket } = useSocket();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['chatRooms'],
    queryFn:  () => api.getChatRooms(),
  });

  useEffect(() => {
    if (data?.data?.chatRooms) {
      setRooms(data.data.chatRooms);
    }
  }, [data]);

  // Update unread counts in real-time
  useEffect(() => {
    if (!socket) return;
    const onNewMessage = (msg: { roomId?: string }) => {
      setRooms((prev) =>
        prev.map((r) =>
          r.id === msg.roomId ? { ...r, unreadCount: r.unreadCount + 1, lastMessage: 'New message', lastMessageTime: new Date().toISOString() } : r
        )
      );
    };
    socket.on('new_message', onNewMessage);
    return () => { socket.off('new_message', onNewMessage); };
  }, [socket]);

  return (
    <div className="page-container max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
        <p className="text-gray-500 mt-0.5">Chat with your counsellors</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : rooms.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <MessageCircle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No conversations yet</p>
          <p className="text-sm mt-1">Book a session to start chatting with a counsellor</p>
        </div>
      ) : (
        <div className="space-y-1">
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => router.push(`/chat/${room.id}`)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl hover:bg-gray-50 transition-colors text-left"
            >
              <Avatar
                src={room.counsellorImage}
                name={room.counsellorName}
                size="md"
                online={room.isOnline}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className={`font-medium text-gray-900 ${room.unreadCount > 0 ? 'font-semibold' : ''}`}>
                    {room.counsellorName}
                  </p>
                  {room.lastMessageTime && (
                    <span className="text-xs text-gray-400 shrink-0">
                      {formatChatTime(room.lastMessageTime)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className={`text-sm truncate ${room.unreadCount > 0 ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                    {room.lastMessage ? truncate(room.lastMessage, 40) : 'No messages yet'}
                  </p>
                  {room.unreadCount > 0 && (
                    <span className="ml-2 bg-primary-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center shrink-0 font-medium">
                      {room.unreadCount > 9 ? '9+' : room.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
