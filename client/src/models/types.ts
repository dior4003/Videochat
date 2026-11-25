export interface UserProfile {
  id: string;
  email?: string; // faqat o'z profilingizda mavjud
  username: string;
  inviteCode?: string;
  phone?: string; // faqat o'z profilingizda mavjud
  displayName: string;
  bio: string;
  avatarColor: string;
  avatarUrl?: string | null;
  role?: 'user' | 'moderator' | 'admin';
  isBanned?: boolean;
  online?: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  type: 'text' | 'image' | 'file';
  mediaUrl?: string | null;
  status: 'sent' | 'delivered' | 'read';
  createdAt: string;
}

export interface ChatSummary {
  peer: UserProfile;
  lastMessage: ChatMessage | null;
  unreadCount: number;
}

export interface FriendItem {
  relationId: string;
  peer: UserProfile;
}

export interface SearchResultItem {
  message: ChatMessage;
  peer: UserProfile;
}

export interface CallRecord {
  id: string;
  callType: 'audio' | 'video';
  status: string;
  direction: 'incoming' | 'outgoing';
  durationSec: number;
  startedAt: string;
  peer: UserProfile | null;
}

export interface ModStats {
  totalUsers: number;
  bannedUsers: number;
  totalMessages: number;
  totalCalls: number;
  openReports: number;
}

export interface ReportItem {
  id: string;
  reason: string;
  status: 'open' | 'resolved';
  createdAt: string;
  reporterName: string;
  targetUserId: string;
  targetName: string;
}

export interface IceServerConfig {
  urls: string;
  username?: string;
  credential?: string;
}

export interface ServerConfig {
  googleClientId: string;
  database: string;
  iceServers: IceServerConfig[];
}
