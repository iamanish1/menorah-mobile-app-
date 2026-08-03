'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, CheckCheck, Clock3, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar, Spinner } from '@/components/ui';
import { formatMessageTime } from '@/lib/utils';
import { useSocket } from '@/context/SocketContext';
import { useAuth } from '@/context/AuthContext';
import { socketEvents } from '@/lib/socket';
import type { ChatMessage, User } from '@/types';

type LocalChatMessage = ChatMessage & {
  localId?: string;
  localStatus?: 'sending' | 'failed';
};

type UserWithMongoId = User & {
  _id?: string | { toString: () => string };
};

function getUserId(user: User | null): string {
  const rawId = user?.id ?? (user as UserWithMongoId | null)?._id;
  if (!rawId) return '';
  return typeof rawId === 'string' ? rawId : rawId.toString();
}

function getUserName(user: User | null): string {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  return name || 'You';
}

function mergeChatMessages(existing: LocalChatMessage[], incoming: LocalChatMessage[]) {
  const messagesById = new Map(existing.map((message) => [message.id, message]));
  incoming.forEach((message) => {
    const current = messagesById.get(message.id);
    const statusRank = { sent: 0, delivered: 1, read: 2 } as const;
    const currentStatus = current?.status ?? 'sent';
    const incomingStatus = message.status ?? 'sent';
    messagesById.set(message.id, {
      ...current,
      ...message,
      status: statusRank[currentStatus] > statusRank[incomingStatus]
        ? currentStatus
        : incomingStatus,
    });
  });
  return [...messagesById.values()].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

function MessageStatus({ status, localStatus }: { status?: ChatMessage['status']; localStatus?: LocalChatMessage['localStatus'] }) {
  if (localStatus === 'sending') {
    return (
      <span className="inline-flex items-center gap-1">
        <Clock3 className="h-3 w-3" />
        Sending
      </span>
    );
  }

  if (localStatus === 'failed') {
    return <span className="text-red-500 dark:text-red-300">Failed</span>;
  }

  if (status === 'read') {
    return <CheckCheck className="inline h-3.5 w-3.5 text-primary-500 dark:text-primary-200" aria-label="Read" />;
  }

  return <Check className="inline h-3.5 w-3.5" aria-label={status === 'delivered' ? 'Delivered' : 'Sent'} />;
}

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
  const { socket, isConnected, joinRoom, leaveRoom, startTyping, stopTyping, markRead } = useSocket();

  const [messages, setMessages]       = useState<LocalChatMessage[]>([]);
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
  const connectedOnceRef = useRef(isConnected);
  const missedSocketEventsRef = useRef(false);
  const myId         = getUserId(user);

  useEffect(() => {
    setMessages([]);
    setPage(1);
    setHasMore(true);
  }, [roomId]);

  // Get chat rooms to find counsellor info — always refetch so newly created rooms show up
  const { data: roomsData } = useQuery({
    queryKey: ['chatRooms'],
    queryFn:  () => api.getChatRooms(),
    staleTime: 0,
    refetchOnMount: true,
  });
  const room = roomsData?.data?.chatRooms?.find((r) => r.id === roomId);

  // Load initial messages
  const { isLoading } = useQuery({
    queryKey: ['messages', roomId, 1],
    queryFn:  async () => {
      const res = await api.getMessages(roomId, 1, 30);
      if (res.success && res.data?.messages) {
        setMessages((currentMessages) => mergeChatMessages(currentMessages, res.data!.messages));
        setHasMore((res.data.pagination?.page ?? 1) < (res.data.pagination?.pages ?? 1));
      }
      return res;
    },
    staleTime: 0,
  });

  useEffect(() => {
    if (!isConnected) {
      if (connectedOnceRef.current) missedSocketEventsRef.current = true;
      return;
    }

    if (!connectedOnceRef.current) {
      connectedOnceRef.current = true;
      return;
    }

    if (missedSocketEventsRef.current) {
      missedSocketEventsRef.current = false;
      void qc.invalidateQueries({ queryKey: ['messages', roomId, 1] });
      void qc.invalidateQueries({ queryKey: ['chatRooms'] });
    }
  }, [isConnected, qc, roomId]);

  // Socket.IO setup
  useEffect(() => {
    joinRoom(roomId);
    socket?.emit(socketEvents.SET_ONLINE_STATUS, true);

    return () => {
      leaveRoom(roomId);
    };
  }, [roomId, socket, joinRoom, leaveRoom]);

  // Initialise counsellor online status from REST data when room loads
  useEffect(() => {
    if (room?.isOnline !== undefined) {
      setCounsellorOnline(room.isOnline);
    }
  }, [room?.isOnline]);

  useEffect(() => {
    if (!socket) return;

    const onNewMessage = (msg: ChatMessage) => {
      if (msg.roomId !== roomId) return;
      const isOwnIncoming = !!myId && msg.senderId === myId;

      setMessages((prev) => {
        // Replace optimistic placeholder if content matches (own sent messages)
        const optIdx = isOwnIncoming
          ? prev.findIndex((m) => m.id.startsWith('opt_') && m.senderId === myId && m.content === msg.content)
          : -1;

        if (optIdx !== -1) {
          const next = [...prev];
          next[optIdx] = {
            ...msg,
            localId: next[optIdx].localId ?? next[optIdx].id,
            localStatus: undefined,
          };
          return next;
        }
        // Deduplicate by real message ID
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      if (!isOwnIncoming) {
        markRead(roomId, msg.id);
      }
    };

    const onTyping = (data: { userId?: string; isTyping?: boolean }) => {
      if (data.userId !== myId) setCounsellorTyping(data.isTyping ?? false);
    };

    const onStatusChanged = (data: { userId?: string; isOnline?: boolean }) => {
      if (room?.counsellorUserId && data.userId === room.counsellorUserId) {
        setCounsellorOnline(data.isOnline ?? false);
      }
    };

    const onMessageRead = (data: { roomId?: string; messageId?: string }) => {
      if (data.roomId !== roomId || !data.messageId) return;
      setMessages((previousMessages) => previousMessages.map((message) =>
        message.id === data.messageId ? { ...message, status: 'read' } : message
      ));
    };

    const onMessageDeleted = (data: { roomId?: string; messageId?: string }) => {
      if (data.roomId !== roomId || !data.messageId) return;
      setMessages((previousMessages) => previousMessages.filter(
        (message) => message.id !== data.messageId
      ));
    };

    socket.on(socketEvents.NEW_MESSAGE, onNewMessage);
    socket.on(socketEvents.USER_TYPING, onTyping);
    socket.on(socketEvents.USER_STATUS_CHANGED, onStatusChanged);
    socket.on(socketEvents.MESSAGE_READ, onMessageRead);
    socket.on(socketEvents.MESSAGE_DELETED, onMessageDeleted);

    return () => {
      socket.off(socketEvents.NEW_MESSAGE, onNewMessage);
      socket.off(socketEvents.USER_TYPING, onTyping);
      socket.off(socketEvents.USER_STATUS_CHANGED, onStatusChanged);
      socket.off(socketEvents.MESSAGE_READ, onMessageRead);
      socket.off(socketEvents.MESSAGE_DELETED, onMessageDeleted);
    };
  }, [socket, myId, roomId, room, markRead]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || !myId) return;

    setInput('');
    stopTyping(roomId);

    // Optimistic update
    const optimisticId = `opt_${Date.now()}`;
    const optimistic: LocalChatMessage = {
      id:         optimisticId,
      localId:    optimisticId,
      senderId:   myId,
      senderName: getUserName(user),
      content,
      timestamp:  new Date().toISOString(),
      type:       'text',
      status:     'sent',
      localStatus: 'sending',
    };
    setMessages((prev) => [...prev, optimistic]);

    // Send via REST only — backend emits new_message via socket to all participants
    try {
      const res = await api.sendMessage(roomId, content);
      if (res.success && res.data?.message) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === optimisticId
              ? { ...res.data!.message, localId: optimisticId, localStatus: undefined }
              : msg
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((msg) => (msg.id === optimisticId ? { ...msg, localStatus: 'failed' } : msg))
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === optimisticId ? { ...msg, localStatus: 'failed' } : msg))
      );
    }
  }, [input, roomId, user, myId, stopTyping]);

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
      setMessages((prev) => mergeChatMessages(prev, res.data!.messages));
      setPage(nextPage);
      setHasMore(nextPage < (res.data.pagination?.pages ?? 1));
    }
    setLoadingMore(false);
  };

  return (
    <div className="chat-thread flex h-screen flex-col bg-surface-50 lg:h-[calc(100vh-0px)] dark:bg-[#020604]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-100 bg-white/90 px-4 py-3 backdrop-blur-xl dark:border-primary-900 dark:bg-[#07110b]/92">
        <button onClick={() => router.back()} className="rounded-full p-2 transition-colors hover:bg-gray-100 dark:hover:bg-primary-900">
          <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-primary-100" />
        </button>
        {room ? (
          <>
            <Avatar src={room.counsellorImage} name={room.counsellorName} size="sm" online={counsellorOnline || room.isOnline} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-primary-50">{room.counsellorName}</p>
              <p className="text-xs text-gray-400 dark:text-primary-100/55">
                {counsellorOnline || room.isOnline ? 'Online' : 'Offline'}
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 min-w-0">
            <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
            <div className="h-3 w-16 bg-gray-100 rounded animate-pulse mt-1" />
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto bg-surface-50 px-4 py-4 dark:bg-[#020604]">
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
                  className="inline-flex min-h-8 items-center justify-center gap-2 py-1 text-xs text-primary-600 hover:text-primary-700 disabled:opacity-70"
                >
                  {loadingMore && <Spinner size="sm" />}
                  {loadingMore ? 'Loading…' : 'Load older messages'}
                </button>
              </div>
            )}

            {messages.map((msg) => {
              const isMe = !!myId && msg.senderId === myId;
              const isSending = msg.localStatus === 'sending';
              const isFailed = msg.localStatus === 'failed';
              return (
                <div
                  key={msg.localId ?? msg.id}
                  className={`chat-message-row flex ${isMe ? 'chat-message-row--me justify-end' : 'chat-message-row--them justify-start'} gap-2`}
                >
                  {!isMe && (
                    <Avatar src={room?.counsellorImage} name={room?.counsellorName ?? 'C'} size="sm" className="mt-auto shrink-0" />
                  )}
                  <div className="group max-w-[78%]">
                    <div
                      className={`chat-bubble px-4 py-2.5 text-sm leading-relaxed
                        ${isMe ? 'chat-bubble--me' : 'chat-bubble--them'}
                        ${isSending ? 'chat-bubble--sending' : ''}
                        ${isFailed ? 'chat-bubble--failed' : ''}`}
                    >
                      {msg.content}
                    </div>
                    <p className={`mt-1.5 text-[10px] ${isMe ? 'text-right text-gray-400 dark:text-primary-100/45' : 'text-gray-400 dark:text-primary-100/45'}`}>
                      {formatMessageTime(msg.timestamp)}
                      {isMe && (
                        <span className="ml-1.5 align-middle">
                          <MessageStatus status={msg.status} localStatus={msg.localStatus} />
                        </span>
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
      <div className="flex shrink-0 items-end gap-3 border-t border-gray-100 bg-white/92 px-4 py-3 backdrop-blur-xl dark:border-primary-900 dark:bg-[#07110b]/92">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send)"
          rows={1}
          className="flex-1 resize-none rounded-[1.35rem] border border-gray-200 bg-gray-50 px-4 py-3
                     text-sm text-gray-950 transition-all placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500
                     dark:border-primary-800 dark:bg-[#020604] dark:text-primary-50 dark:placeholder:text-primary-100/45
                     max-h-32"
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
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg shadow-primary-600/20 transition-all hover:scale-105 hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 dark:bg-primary-300 dark:text-[#06110b] dark:shadow-primary-300/15"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
