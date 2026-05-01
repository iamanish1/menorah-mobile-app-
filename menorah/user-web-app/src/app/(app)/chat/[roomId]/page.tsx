'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Send, Paperclip, MoreVertical } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar, Spinner } from '@/components/ui';
import { formatMessageTime } from '@/lib/utils';
import { useSocket } from '@/context/SocketContext';
import { useAuth } from '@/context/AuthContext';
import { socketEvents } from '@/lib/socket';
import type { ChatMessage } from '@/types';

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 bg-gray-400 rounded-full animate-pulse-dot"
            style={{ animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </div>
      <span className="text-xs text-gray-400">typing…</span>
    </div>
  );
}

export default function ChatThreadPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router     = useRouter();
  const { user }   = useAuth();
  const qc         = useQueryClient();
  const { socket, joinRoom, leaveRoom, sendMessage, startTyping, stopTyping, markRead } = useSocket();

  const [messages, setMessages]       = useState<ChatMessage[]>([]);
  const [input, setInput]             = useState('');
  const [isTyping, setIsTyping]       = useState(false);
  const [counsellorTyping, setCounsellorTyping] = useState(false);
  const [counsellorOnline, setCounsellorOnline] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage]               = useState(1);
  const [hasMore, setHasMore]         = useState(true);

  const bottomRef    = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const typingTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get chat rooms to find counsellor info
  const { data: roomsData } = useQuery({
    queryKey: ['chatRooms'],
    queryFn:  () => api.getChatRooms(),
  });
  const room = roomsData?.data?.chatRooms?.find((r) => r.id === roomId);

  // Load initial messages
  const { isLoading } = useQuery({
    queryKey: ['messages', roomId, 1],
    queryFn:  async () => {
      const res = await api.getMessages(roomId, 1, 30);
      if (res.success && res.data?.messages) {
        setMessages(res.data.messages.reverse());
        setHasMore((res.data.pagination?.page ?? 1) < (res.data.pagination?.pages ?? 1));
      }
      return res;
    },
    staleTime: 0,
  });

  // Socket.IO setup
  useEffect(() => {
    joinRoom(roomId);
    socket?.emit(socketEvents.SET_ONLINE_STATUS, true);

    return () => {
      leaveRoom(roomId);
    };
  }, [roomId, socket, joinRoom, leaveRoom]);

  useEffect(() => {
    if (!socket) return;

    const onNewMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
      if (msg.senderId !== user?.id) {
        markRead(roomId, msg.id);
      }
    };

    const onTyping = (data: { userId?: string; isTyping?: boolean }) => {
      if (data.userId !== user?.id) setCounsellorTyping(data.isTyping ?? false);
    };

    const onStatusChanged = (data: { userId?: string; isOnline?: boolean }) => {
      if (room?.counsellorUserId && data.userId === room.counsellorUserId) {
        setCounsellorOnline(data.isOnline ?? false);
      }
    };

    socket.on(socketEvents.NEW_MESSAGE, onNewMessage);
    socket.on(socketEvents.USER_TYPING, onTyping);
    socket.on(socketEvents.USER_STATUS_CHANGED, onStatusChanged);

    return () => {
      socket.off(socketEvents.NEW_MESSAGE, onNewMessage);
      socket.off(socketEvents.USER_TYPING, onTyping);
      socket.off(socketEvents.USER_STATUS_CHANGED, onStatusChanged);
    };
  }, [socket, user, roomId, room, markRead]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content) return;

    setInput('');
    stopTyping(roomId);

    // Optimistic update
    const optimistic: ChatMessage = {
      id:         `opt_${Date.now()}`,
      senderId:   user?.id ?? '',
      senderName: `${user?.firstName} ${user?.lastName}`,
      content,
      timestamp:  new Date().toISOString(),
      type:       'text',
      status:     'sent',
    };
    setMessages((prev) => [...prev, optimistic]);

    sendMessage(roomId, content);
    await api.sendMessage(roomId, content);
  }, [input, roomId, user, sendMessage, stopTyping]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (!isTyping) {
      setIsTyping(true);
      startTyping(roomId);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      setIsTyping(false);
      stopTyping(roomId);
    }, 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    const res = await api.getMessages(roomId, nextPage, 30);
    if (res.success && res.data?.messages) {
      setMessages((prev) => [...res.data!.messages.reverse(), ...prev]);
      setPage(nextPage);
      setHasMore(nextPage < (res.data.pagination?.pages ?? 1));
    }
    setLoadingMore(false);
  };

  return (
    <div className="flex flex-col h-screen lg:h-[calc(100vh-0px)]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        {room && (
          <>
            <Avatar src={room.counsellorImage} name={room.counsellorName} size="sm" online={counsellorOnline || room.isOnline} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">{room.counsellorName}</p>
              <p className="text-xs text-gray-400">
                {counsellorOnline || room.isOnline ? 'Online' : 'Offline'}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-surface-50">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-xs text-primary-600 hover:text-primary-700 py-1"
                >
                  {loadingMore ? 'Loading…' : 'Load older messages'}
                </button>
              </div>
            )}

            {messages.map((msg) => {
              const isMe = msg.senderId === user?.id;
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} gap-2`}>
                  {!isMe && (
                    <Avatar src={room?.counsellorImage} name={room?.counsellorName ?? 'C'} size="sm" className="mt-auto shrink-0" />
                  )}
                  <div className={`max-w-[75%] group`}>
                    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed
                      ${isMe
                        ? 'bg-primary-600 text-white rounded-br-sm'
                        : 'bg-white text-gray-900 shadow-card rounded-bl-sm'
                      }`}
                    >
                      {msg.content}
                    </div>
                    <p className={`text-[10px] mt-1 ${isMe ? 'text-right text-gray-400' : 'text-gray-400'}`}>
                      {formatMessageTime(msg.timestamp)}
                      {isMe && msg.status && (
                        <span className="ml-1">{msg.status === 'read' ? '✓✓' : '✓'}</span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}

            {counsellorTyping && <TypingIndicator />}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input bar */}
      <div className="bg-white border-t border-gray-100 px-4 py-3 flex items-end gap-3 shrink-0">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send)"
          rows={1}
          className="flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3
                     text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                     max-h-32 transition-all"
          style={{ height: 'auto' }}
          onInput={(e) => {
            const el = e.target as HTMLTextAreaElement;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 128) + 'px';
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="w-10 h-10 bg-primary-600 hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed
                     rounded-xl flex items-center justify-center text-white transition-colors shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
