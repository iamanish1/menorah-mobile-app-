'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
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
  const [startingChat, setStartingChat] = useState<string | null>(null);

  const { data: roomsData, isLoading: roomsLoading } = useQuery({
    queryKey: ['chatRooms'],
    queryFn:  () => api.getChatRooms(),
  });

  const { data: counsellorsData, isLoading: counsellorsLoading } = useQuery({
    queryKey: ['availableCounsellorsForChat'],
    queryFn:  () => api.getAvailableCounsellorsForChat(),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (roomsData?.data?.chatRooms) {
      setRooms(roomsData.data.chatRooms);
    }
  }, [roomsData]);

  useEffect(() => {
    if (!socket) return;
    const onNewMessage = (msg: { roomId?: string }) => {
      setRooms((prev) =>
        prev.map((r) =>
          r.id === msg.roomId
            ? { ...r, unreadCount: r.unreadCount + 1, lastMessage: 'New message', lastMessageTime: new Date().toISOString() }
            : r
        )
      );
    };
    socket.on('new_message', onNewMessage);
    return () => { socket.off('new_message', onNewMessage); };
  }, [socket]);

  const handleStartChat = async (counsellorId: string) => {
    setStartingChat(counsellorId);
    try {
      const res = await api.startChat(counsellorId);
      if (res.success && res.data?.room?.id) {
        router.push(`/chat/${res.data.room.id}`);
      }
    } finally {
      setStartingChat(null);
    }
  };

  const availableCounsellors = counsellorsData?.data?.counsellors ?? [];
  const isLoading = roomsLoading || counsellorsLoading;

  return (
    <div className="page-container max-w-2xl">
      <div className="mb-6 rounded-[1.75rem] border border-primary-100 bg-primary-50 px-5 py-5 dark:border-primary-800 dark:bg-primary-900/70">
        <h1 className="app-page-heading">Messages</h1>
        <p className="app-page-subtitle mt-0.5">Chat with a counsellor</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="space-y-8">

          {/* ── Available Counsellors ── */}
          <section>
            <h2 className="text-sm font-black text-gray-500 dark:text-primary-100/70 uppercase tracking-wide mb-3">
              Available Counsellors
            </h2>
            {availableCounsellors.length === 0 ? (
              <div className="card text-center py-10 text-gray-400 dark:text-primary-100/60">
                <p className="text-sm">No counsellors available right now</p>
              </div>
            ) : (
              <div className="space-y-2">
                {availableCounsellors.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleStartChat(c.counsellorId)}
                    disabled={startingChat === c.counsellorId}
                    className="w-full flex items-center gap-3 p-4 rounded-[1.4rem] border border-primary-100 bg-white hover:bg-primary-50 transition-colors text-left disabled:opacity-60 dark:border-primary-800 dark:bg-primary-900 dark:hover:bg-primary-800"
                  >
                    <Avatar
                      src={c.profileImage ?? undefined}
                      name={c.name}
                      size="md"
                      online={c.isOnline}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-950 dark:text-primary-50">{c.name}</p>
                      <p className="text-sm text-gray-500 dark:text-primary-100/65 truncate">
                        {c.specialization.length > 0 ? c.specialization.join(', ') : 'Counsellor'}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {c.isOnline && (
                        <span className="text-xs text-green-600 font-medium">Online</span>
                      )}
                      {startingChat === c.counsellorId ? (
                        <Spinner size="sm" />
                      ) : (
                        <span className="text-xs text-primary-600 font-medium">Chat</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ── Existing Conversations ── */}
          {rooms.length > 0 && (
            <section>
            <h2 className="text-sm font-black text-gray-500 dark:text-primary-100/70 uppercase tracking-wide mb-3">
                Recent Conversations
              </h2>
              <div className="space-y-1">
                {rooms.map((room) => (
                  <button
                    key={room.id}
                    onClick={() => router.push(`/chat/${room.id}`)}
                    className="w-full flex items-center gap-3 p-4 rounded-[1.4rem] hover:bg-primary-50 transition-colors text-left dark:hover:bg-primary-900"
                  >
                    <Avatar
                      src={room.counsellorImage}
                      name={room.counsellorName}
                      size="md"
                      online={room.isOnline}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className={`font-bold text-gray-950 dark:text-primary-50 ${room.unreadCount > 0 ? 'font-black' : ''}`}>
                          {room.counsellorName}
                        </p>
                        {room.lastMessageTime && (
                          <span className="text-xs text-gray-400 dark:text-primary-100/50 shrink-0">
                            {formatChatTime(room.lastMessageTime)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className={`text-sm truncate ${room.unreadCount > 0 ? 'text-gray-900 dark:text-primary-50 font-medium' : 'text-gray-400 dark:text-primary-100/50'}`}>
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
            </section>
          )}

        </div>
      )}
    </div>
  );
}
