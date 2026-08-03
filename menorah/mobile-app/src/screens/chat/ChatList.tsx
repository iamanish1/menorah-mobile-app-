import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert, Modal, TextInput,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import {
  Plus, X, Search, SlidersHorizontal, ShieldCheck,
  Mail, Users, Archive, Bell, ChevronRight, MessageSquare,
  MessageCircle, Lock,
} from "lucide-react-native";
import { useThemeMode } from "@/theme/ThemeProvider";
import { palettes } from "@/theme/colors";
import { useChat } from "@/state/useChat";
import { useAuth } from "@/state/useAuth";
import { api, ChatRoom } from "@/lib/api";
import { reportError } from "@/lib/safeDiagnostics";
import { useFocusEffect } from "@react-navigation/native";

type FilterTab = 'all' | 'unread' | 'counsellors' | 'archived';

const FILTER_TABS: { id: FilterTab; label: string; icon: any }[] = [
  { id: 'all',         label: 'All',         icon: MessageSquare },
  { id: 'unread',      label: 'Unread',      icon: Mail },
  { id: 'counsellors', label: 'Counsellors', icon: Users },
  { id: 'archived',    label: 'Archived',    icon: Archive },
];

export default function ChatList({ navigation }: any) {
  const { scheme } = useThemeMode();
  const colors = palettes[scheme];
  const { chatRooms, fetchChatRooms, isConnected } = useChat();
  const { user } = useAuth();

  const [loading, setLoading]                           = useState(false);
  const [refreshing, setRefreshing]                     = useState(false);
  const [showModal, setShowModal]                       = useState(false);
  const [availableCounsellors, setAvailableCounsellors] = useState<any[]>([]);
  const [loadingCounsellors, setLoadingCounsellors]     = useState(false);
  const [activeFilter, setActiveFilter]                 = useState<FilterTab>('all');
  const [searchQ, setSearchQ]                           = useState('');
  const connectedOnceRef = useRef(isConnected);
  const missedSocketEventsRef = useRef(false);

  const loadChatRooms = useCallback(async () => {
    setLoading(true);
    try {
      await fetchChatRooms();
    } catch (error) {
      reportError('chat.list_fetch_failed', error);
    } finally {
      setLoading(false);
    }
  }, [fetchChatRooms]);

  useFocusEffect(useCallback(() => {
    loadChatRooms();
  }, [loadChatRooms]));

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
      fetchChatRooms();
    }
  }, [fetchChatRooms, isConnected]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchChatRooms();
    setRefreshing(false);
  };

  const loadAvailableCounsellors = async () => {
    setLoadingCounsellors(true);
    setShowModal(true);
    try {
      const res = await api.getAvailableCounsellors();
      if (res.success && res.data) {
        setAvailableCounsellors(res.data.counsellors || []);
      } else {
        Alert.alert('Error', res.message || 'Failed to load counsellors');
        setShowModal(false);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load counsellors');
      setShowModal(false);
    } finally {
      setLoadingCounsellors(false);
    }
  };

  const handleStartChat = async (counsellorId: string, name: string) => {
    try {
      const res = await api.startChat(counsellorId);
      if (res.success && res.data) {
        const room = res.data.room;
        setShowModal(false);
        await fetchChatRooms();
        navigation.navigate('ChatThread', {
          roomId: room.roomId || room.id,
          counsellorUserId: room.counsellorUserId || room.counsellorId,
          counsellorName: room.counsellorName || name,
          counsellorImage: room.counsellorImage,
        });
      } else {
        Alert.alert('Error', res.message || 'Failed to start chat');
      }
    } catch {
      Alert.alert('Error', 'Failed to start chat. Please try again.');
    }
  };

  const formatTime = (ts: string) => {
    try {
      const date = new Date(ts);
      const now  = new Date();
      const diff = now.getTime() - date.getTime();
      const days = Math.floor(diff / 86400000);
      if (days === 0) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      if (days === 1) return 'Yesterday';
      if (days < 7)   return date.toLocaleDateString('en-US', { weekday: 'short' });
      return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    } catch { return ''; }
  };

  const totalUnread = chatRooms.reduce((s: number, r: ChatRoom) => s + (r.unreadCount || 0), 0);

  const filteredRooms = chatRooms.filter((r: ChatRoom) => {
    const q = searchQ.trim().toLowerCase();
    if (q && !(r.counsellorName || '').toLowerCase().includes(q) && !(r.lastMessage || '').toLowerCase().includes(q)) return false;
    if (activeFilter === 'unread') return (r.unreadCount || 0) > 0;
    return true;
  });

  const insets = useSafeAreaInsets();
  const tabBarClearance = 74 + Math.max(insets.bottom, 16) + 24;

  const isDark   = scheme === 'dark';
  const cardBg   = isDark ? colors.card : '#ffffff';
  const pageBg   = isDark ? colors.bg : '#f5f7f5';
  const bannerBg = isDark ? colors.primaryDark : '#edf7f1';
  const primaryActionText = isDark ? colors.primaryDark : 'white';

  const getInitial = (name: string) => (name || 'C').charAt(0).toUpperCase();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: pageBg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: tabBarClearance }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >

        {/* ── Header ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 2, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 32, fontWeight: '900', color: colors.text, letterSpacing: -0.6 }}>
              Messages
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted, marginTop: 3 }}>
              Chat with your counsellors
            </Text>
          </View>
          <TouchableOpacity
            onPress={loadAvailableCounsellors}
            style={{
              width: 48, height: 48, borderRadius: 24,
              backgroundColor: colors.primary,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: colors.primary,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.35, shadowRadius: 10, elevation: 5,
            }}
          >
            <Plus size={24} color={primaryActionText} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        {/* ── Search ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{
            flex: 1, flexDirection: 'row', alignItems: 'center',
            backgroundColor: cardBg, borderRadius: 50,
            borderWidth: 1, borderColor: colors.border,
            paddingHorizontal: 16, height: 48, gap: 10,
          }}>
            <Search size={16} color={colors.muted} />
            <TextInput
              value={searchQ}
              onChangeText={setSearchQ}
              placeholder="Search counsellor or messages"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ flex: 1, fontSize: 14, color: colors.text, paddingVertical: 0 }}
            />
          </View>
          <TouchableOpacity style={{
            width: 48, height: 48, borderRadius: 24,
            backgroundColor: cardBg, borderWidth: 1, borderColor: colors.border,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <SlidersHorizontal size={18} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* ── Filter tabs ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 18 }}
        >
          {FILTER_TABS.map((tab) => {
            const active = activeFilter === tab.id;
            const Icon   = tab.icon;
            const badge  = tab.id === 'unread' && totalUnread > 0 ? totalUnread : null;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => setActiveFilter(tab.id)}
                activeOpacity={0.82}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 16, paddingVertical: 10, borderRadius: 50,
                  backgroundColor: active ? colors.primary : cardBg,
                  borderWidth: 1.5,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Icon size={14} color={active ? primaryActionText : colors.muted} strokeWidth={2} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: active ? primaryActionText : colors.muted }}>
                  {tab.label}
                </Text>
                {badge && (
                  <View style={{
                    minWidth: 20, height: 20, borderRadius: 10,
                    backgroundColor: active ? 'rgba(255,255,255,0.28)' : colors.primary,
                    alignItems: 'center', justifyContent: 'center',
                    paddingHorizontal: 4,
                  }}>
                    <Text style={{ color: active ? primaryActionText : primaryActionText, fontSize: 10, fontWeight: '900' }}>{badge}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Privacy banner ── */}
        <View style={{
            marginHorizontal: 20, marginBottom: 22,
            backgroundColor: cardBg, borderRadius: 20,
            borderWidth: 1, borderColor: colors.border,
            overflow: 'hidden', flexDirection: 'row', alignItems: 'center',
            minHeight: 90,
          }}>
            {/* Left content */}
            <View style={{ flex: 1, padding: 16, paddingRight: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <View style={{
                  width: 40, height: 40, borderRadius: 20,
                  backgroundColor: colors.primary + '14',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <ShieldCheck size={20} color={colors.primary} />
                </View>
              </View>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.text, marginBottom: 4 }}>
                Care conversations
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
                Messages use secure connections and are stored to support your care conversation.
              </Text>
            </View>

            {/* Right illustration — decorative lock */}
            <View style={{
              width: 90, alignItems: 'center', justifyContent: 'center',
              paddingRight: 8,
            }}>
              <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
                {/* Leaf accents */}
                <View style={{
                  width: 72, height: 72, borderRadius: 36,
                  backgroundColor: colors.primary + '10',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <View style={{
                    width: 52, height: 52, borderRadius: 26,
                    backgroundColor: colors.primary + '1C',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Lock size={26} color={colors.primary} strokeWidth={2} />
                  </View>
                </View>
                {/* Sparkle dots */}
                {[[-4, -28], [28, -10], [-26, 10]].map(([x, y], i) => (
                  <View key={i} style={{
                    position: 'absolute', left: 36 + x, top: 36 + y,
                    width: 5, height: 5, borderRadius: 3,
                    backgroundColor: colors.primary + '60',
                  }} />
                ))}
              </View>
            </View>

        </View>

        {/* ── Chat list / empty state ── */}
        {loading ? (
          <View style={{ alignItems: 'center', marginTop: 60 }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>

        ) : filteredRooms.length > 0 ? (
          <View style={{ paddingHorizontal: 20 }}>

            {/* Section header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>Recent</Text>
              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>Sort by: </Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>Recent</Text>
                <ChevronRight size={14} color={colors.primary} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            {/* Rooms card */}
            <View style={{
              backgroundColor: cardBg, borderRadius: 22,
              borderWidth: 1, borderColor: colors.border,
              overflow: 'hidden', marginBottom: 16,
            }}>
              {filteredRooms.map((chat: ChatRoom, idx: number) => {
                const hasUnread    = (chat.unreadCount || 0) > 0;
                const isOwnMessage = chat.lastMessageSenderId && user?.id && chat.lastMessageSenderId === user.id;
                const preview      = chat.lastMessage || 'No messages yet';

                return (
                  <TouchableOpacity
                    key={chat.id}
                    onPress={() => navigation.navigate('ChatThread', {
                      roomId: chat.id,
                      counsellorUserId: chat.counsellorUserId,
                      counsellorName: chat.counsellorName,
                      counsellorImage: chat.counsellorImage,
                    })}
                    activeOpacity={0.82}
                    style={{
                      flexDirection: 'row',
                      paddingHorizontal: 16,
                      paddingVertical: 16,
                      alignItems: 'center',
                      borderTopWidth: idx === 0 ? 0 : 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    {/* Avatar */}
                    <View style={{ position: 'relative', flexShrink: 0, marginRight: 14 }}>
                      {chat.counsellorImage ? (
                        <Image
                          source={{ uri: chat.counsellorImage }}
                          style={{ width: 58, height: 58, borderRadius: 29 }}
                          contentFit="cover"
                        />
                      ) : (
                        <View style={{
                          width: 58, height: 58, borderRadius: 29,
                          backgroundColor: colors.primary + '18',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.primary }}>
                            {getInitial(chat.counsellorName)}
                          </Text>
                        </View>
                      )}
                      {chat.isOnline && (
                        <View style={{
                          position: 'absolute', bottom: 2, right: 2,
                          width: 14, height: 14, borderRadius: 7,
                          backgroundColor: '#22c55e',
                          borderWidth: 2.5, borderColor: cardBg,
                        }} />
                      )}
                    </View>

                    {/* Text content */}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      {/* Row 1: name + timestamp */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, flex: 1, marginRight: 8 }} numberOfLines={1}>
                          {chat.counsellorName && chat.counsellorName !== 'undefined undefined'
                            ? chat.counsellorName : 'Counsellor'}
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: hasUnread ? colors.primary : colors.muted, flexShrink: 0 }}>
                          {formatTime(chat.lastMessageTime)}
                        </Text>
                      </View>

                      {/* Row 2: specialization */}
                      {chat.specialization ? (
                        <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }} numberOfLines={1}>
                          {chat.specialization}
                        </Text>
                      ) : null}

                      {/* Row 3: message preview + badge */}
                      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                        <Text
                          style={{ fontSize: 13, color: colors.muted, flex: 1, lineHeight: 19, marginRight: 8 }}
                          numberOfLines={2}
                        >
                          {isOwnMessage ? (
                            <Text>
                              <Text style={{ fontWeight: '600', color: colors.muted }}>You: </Text>
                              {preview}
                            </Text>
                          ) : preview}
                        </Text>

                        {/* Unread badge */}
                        {hasUnread && (
                          <View style={{
                            minWidth: 24, height: 24, borderRadius: 12,
                            backgroundColor: colors.primary,
                            alignItems: 'center', justifyContent: 'center',
                            paddingHorizontal: 6, flexShrink: 0,
                          }}>
                            <Text style={{ color: primaryActionText, fontSize: 11, fontWeight: '800' }}>
                              {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Notification banner */}
            <TouchableOpacity
              onPress={() => navigation.navigate('Notifications')}
              activeOpacity={0.88}
              style={{
                backgroundColor: bannerBg, borderRadius: 18,
                padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
                borderWidth: 1, borderColor: colors.primary + '28',
              }}
            >
              <View style={{
                width: 42, height: 42, borderRadius: 21,
                backgroundColor: colors.primary + '18',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Bell size={19} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 2 }}>
                  View app notifications
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  Review recent updates from this app.
                </Text>
              </View>
              <ChevronRight size={16} color={colors.muted} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

        ) : (
          /* ── Empty state ── */
          <View style={{ paddingHorizontal: 20 }}>
            <View style={{
              backgroundColor: cardBg, borderRadius: 24,
              paddingTop: 40, paddingBottom: 32, paddingHorizontal: 24,
              alignItems: 'center', borderWidth: 1, borderColor: colors.border, marginBottom: 16,
            }}>
              <View style={{
                width: 110, height: 110, borderRadius: 55,
                backgroundColor: colors.primary + '10',
                alignItems: 'center', justifyContent: 'center', marginBottom: 22,
              }}>
                <View style={{
                  width: 74, height: 74, borderRadius: 37,
                  backgroundColor: colors.primary + '1C',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <MessageCircle size={32} color={colors.primary} />
                </View>
              </View>
              <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 10 }}>
                No messages yet
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 22, marginBottom: 26 }}>
                Start a conversation with a counsellor{'\n'}to begin your mental wellness journey.
              </Text>
              {!isConnected && (
                <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 16, fontStyle: 'italic' }}>
                  Connecting to chat service…
                </Text>
              )}
              <TouchableOpacity
                onPress={loadAvailableCounsellors}
                activeOpacity={0.88}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  backgroundColor: colors.primary, borderRadius: 50,
                  paddingVertical: 14, paddingHorizontal: 30,
                  width: '100%', justifyContent: 'center',
                }}
              >
                <Plus size={16} color={primaryActionText} />
                <Text style={{ color: primaryActionText, fontSize: 15, fontWeight: '700' }}>Find a Counsellor</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => navigation.navigate('Notifications')}
              activeOpacity={0.88}
              style={{
                backgroundColor: bannerBg, borderRadius: 18,
                padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
                borderWidth: 1, borderColor: colors.primary + '28',
              }}
            >
              <View style={{
                width: 42, height: 42, borderRadius: 21,
                backgroundColor: colors.primary + '18',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Bell size={19} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 2 }}>
                  View app notifications
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  Review recent updates from this app.
                </Text>
              </View>
              <ChevronRight size={16} color={colors.muted} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* ── New Chat Modal ── */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: colors.card,
            borderTopLeftRadius: 28, borderTopRightRadius: 28,
            maxHeight: '84%', paddingBottom: 28,
          }}>
            {/* Modal header */}
            <View style={{
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
              borderBottomWidth: 1, borderBottomColor: colors.border,
            }}>
              <View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>
                  Available Counsellors
                </Text>
                <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}>
                  Tap to start a conversation
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowModal(false)}
                style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: colors.border + '80',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={18} color={colors.text} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }}>
              {loadingCounsellors ? (
                <View style={{ alignItems: 'center', padding: 40 }}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              ) : availableCounsellors.length === 0 ? (
                <View style={{ alignItems: 'center', padding: 40 }}>
                  <View style={{
                    width: 70, height: 70, borderRadius: 35,
                    backgroundColor: colors.primary + '12',
                    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
                  }}>
                    <MessageCircle size={30} color={colors.primary} />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' }}>
                    No counsellors available
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 6 }}>
                    Please try again later.
                  </Text>
                </View>
              ) : (
                availableCounsellors.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => handleStartChat(c.counsellorId || c.id, c.name)}
                    activeOpacity={0.88}
                    style={{
                      flexDirection: 'row', alignItems: 'center',
                      padding: 14, backgroundColor: colors.bg,
                      borderRadius: 18, marginBottom: 10,
                      borderWidth: 1, borderColor: colors.border,
                    }}
                  >
                    <View style={{ position: 'relative' }}>
                      {c.profileImage ? (
                        <Image source={{ uri: c.profileImage }} style={{ width: 52, height: 52, borderRadius: 26 }} contentFit="cover" />
                      ) : (
                        <View style={{
                          width: 52, height: 52, borderRadius: 26,
                          backgroundColor: colors.primary + '18',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.primary }}>
                            {getInitial(c.firstName || c.name)}
                          </Text>
                        </View>
                      )}
                      {c.isOnline && (
                        <View style={{
                          position: 'absolute', bottom: 2, right: 2,
                          width: 13, height: 13, borderRadius: 7,
                          backgroundColor: '#22c55e', borderWidth: 2, borderColor: colors.card,
                        }} />
                      )}
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>{c.name}</Text>
                      {c.specialization ? (
                        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }} numberOfLines={1}>
                          {Array.isArray(c.specialization) ? c.specialization.join(', ') : c.specialization}
                        </Text>
                      ) : null}
                      {c.rating > 0 && (
                        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>⭐ {c.rating.toFixed(1)}</Text>
                      )}
                      {c.isOnline && (
                        <Text style={{ fontSize: 11, color: '#22c55e', fontWeight: '700', marginTop: 2 }}>● Online now</Text>
                      )}
                    </View>
                    <View style={{
                      backgroundColor: colors.primary,
                      paddingHorizontal: 18, paddingVertical: 9, borderRadius: 50,
                    }}>
                      <Text style={{ color: primaryActionText, fontSize: 13, fontWeight: '700' }}>Chat</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
