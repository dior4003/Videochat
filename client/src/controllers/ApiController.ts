import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureStorage } from './secureStorage';
import { store } from '../store/store';
import {
  clearModToken,
  logoutState,
  setAuthError,
  setAuthenticated,
  setAuthLoading,
  setModToken,
  updateCurrentUser,
} from '../store/slices/authSlice';
import {
  setActivePeer,
  setCalls,
  setChats,
  setFriendsData,
  setMessages,
  setSearchResults,
  setUsers,
} from '../store/slices/chatSlice';
import { setIceServers, setServerConfig, setServerUrl } from '../store/slices/settingsSlice';
import { IceServerConfig, ModStats, ReportItem, ServerConfig, UserProfile } from '../models/types';

const TOKEN_KEY = 'pulselink_token';
const SERVER_KEY = 'pulselink_server_url';

async function request<T>(path: string, options: RequestInit = {}, useModToken = false): Promise<T> {
  const { auth, settings } = store.getState();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  const tok = useModToken ? auth.modToken : auth.token;
  if (tok) headers.Authorization = `Bearer ${tok}`;

  const res = await fetch(`${settings.serverUrl}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server xatosi (${res.status})`);
  return data as T;
}

export const ApiController = {
  async loadConfig() {
    try {
      const cfg = await request<ServerConfig>('/api/config');
      store.dispatch(setServerConfig(cfg));
      return cfg;
    } catch {
      return null;
    }
  },

  async saveServerUrl(url: string): Promise<boolean> {
    const clean = url.trim().replace(/\/+$/, '');
    if (!__DEV__ && !/^https:\/\//i.test(clean)) {
      store.dispatch(setAuthError('Xavfsizlik uchun server manzili https:// bilan boshlanishi kerak'));
      return false;
    }
    store.dispatch(setServerUrl(clean));
    await AsyncStorage.setItem(SERVER_KEY, clean);
    return true;
  },

  /** Tizimga kirgandan so'ng TURN'ni ham o'z ichiga olgan ICE serverlarni oladi. */
  async loadIce() {
    try {
      const res = await request<{ iceServers: IceServerConfig[] }>('/api/ice');
      if (res.iceServers && res.iceServers.length) store.dispatch(setIceServers(res.iceServers));
    } catch {
      /* ochiq STUN serverlar bilan davom etamiz */
    }
  },

  async wsTicket(): Promise<string> {
    const res = await request<{ ticket: string }>('/api/ws-ticket', { method: 'POST' });
    return res.ticket;
  },

  /** Fayl uchun qisqa muddatli (2 daqiqa) imzolangan to'liq URL (Linking.openURL uchun). */
  async mediaLink(mediaUrl: string): Promise<string> {
    const name = mediaUrl.replace(/^\/uploads\//, '');
    const res = await request<{ url: string }>(`/api/media/${encodeURIComponent(name)}/link`);
    return `${store.getState().settings.serverUrl}${res.url}`;
  },

  async blockUser(peerId: string) {
    await request('/api/friends/block', { method: 'POST', body: JSON.stringify({ peerId }) });
    await this.refreshLists();
  },

  async unblockUser(peerId: string) {
    await request(`/api/friends/block/${peerId}`, { method: 'DELETE' });
  },

  async changePassword(currentPassword: string, newPassword: string) {
    const res = await request<{ token: string }>('/api/me/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    await secureStorage.setItem(TOKEN_KEY, res.token);
    const user = store.getState().auth.user;
    if (user) store.dispatch(setAuthenticated({ token: res.token, user }));
  },

  async logoutAll() {
    await request('/api/me/logout-all', { method: 'POST' });
    await this.logout();
  },

  async restoreSession(): Promise<boolean> {
    const savedUrl = await AsyncStorage.getItem(SERVER_KEY);
    if (savedUrl) store.dispatch(setServerUrl(savedUrl));
    await this.loadConfig();

    const token = await secureStorage.getItem(TOKEN_KEY);
    if (!token) return false;

    try {
      store.dispatch(setAuthenticated({ token, user: { id: '', email: '', username: '', phone: '', displayName: '', bio: '', avatarColor: '#6366F1' } }));
      const { user } = await request<{ user: UserProfile }>('/api/me');
      store.dispatch(setAuthenticated({ token, user }));
      return true;
    } catch {
      await secureStorage.removeItem(TOKEN_KEY);
      store.dispatch(logoutState());
      return false;
    }
  },

  async login(identifier: string, password: string) {
    store.dispatch(setAuthLoading(true));
    try {
      const res = await request<{ token: string; user: UserProfile }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      await secureStorage.setItem(TOKEN_KEY, res.token);
      store.dispatch(setAuthenticated(res));
      return true;
    } catch (err: any) {
      store.dispatch(setAuthError(err.message));
      return false;
    }
  },

  async register(payload: { displayName: string; email: string; username?: string; phone?: string; password: string }) {
    store.dispatch(setAuthLoading(true));
    try {
      const res = await request<{ token: string; user: UserProfile }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await secureStorage.setItem(TOKEN_KEY, res.token);
      store.dispatch(setAuthenticated(res));
      return true;
    } catch (err: any) {
      store.dispatch(setAuthError(err.message));
      return false;
    }
  },

  async loginWithGoogle(idToken: string) {
    store.dispatch(setAuthLoading(true));
    try {
      const res = await request<{ token: string; user: UserProfile }>('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      });
      await secureStorage.setItem(TOKEN_KEY, res.token);
      store.dispatch(setAuthenticated(res));
      return true;
    } catch (err: any) {
      store.dispatch(setAuthError(err.message));
      return false;
    }
  },

  async updateProfile(payload: { displayName: string; username: string; bio: string; phone: string; avatarColor: string }) {
    const { user } = await request<{ user: UserProfile }>('/api/me', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    store.dispatch(updateCurrentUser(user));
    return user;
  },

  async refreshLists() {
    const [chatsRes, usersRes, callsRes, friendsRes] = await Promise.all([
      request<{ chats: any[] }>('/api/chats'),
      request<{ users: UserProfile[] }>('/api/users'),
      request<{ calls: any[] }>('/api/calls'),
      request<{ friends: any[]; incomingRequests: any[] }>('/api/friends'),
    ]);
    store.dispatch(setChats(chatsRes.chats));
    store.dispatch(setUsers(usersRes.users));
    store.dispatch(setCalls(callsRes.calls));
    store.dispatch(
      setFriendsData({
        friends: friendsRes.friends,
        incomingRequests: friendsRes.incomingRequests,
      })
    );
  },

  async searchMessages(query: string) {
    if (!query.trim()) {
      store.dispatch(setSearchResults([]));
      return;
    }
    const res = await request<{ results: any[] }>(`/api/chats/search?q=${encodeURIComponent(query)}`);
    store.dispatch(setSearchResults(res.results));
  },

  async sendFriendRequest(payload: { targetUserId?: string; username?: string; inviteCode?: string }) {
    await request('/api/friends/request', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await this.refreshLists();
  },

  async acceptFriend(relationId: string) {
    await request(`/api/friends/${relationId}/accept`, { method: 'POST' });
    await this.refreshLists();
  },

  async removeFriend(peerId: string) {
    await request(`/api/friends/${peerId}`, { method: 'DELETE' });
    await this.refreshLists();
  },

  async openChat(peer: UserProfile) {
    store.dispatch(setActivePeer(peer));
    const res = await request<{ messages: any[] }>(`/api/chats/${peer.id}/messages`);
    store.dispatch(setMessages(res.messages));
    this.refreshLists().catch(() => {});
  },

  async uploadMedia(fileName: string, mimeType: string, base64: string) {
    return request<{ url: string; type: 'image' | 'file'; fileName: string }>('/api/media', {
      method: 'POST',
      body: JSON.stringify({ fileName, mimeType, base64 }),
    });
  },

  // Separate Moderator Auth & Moderation API
  async modLogin(identifier: string, password: string, modPasskey: string) {
    const res = await request<{ modToken: string }>('/api/mod/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password, modPasskey }),
    });
    store.dispatch(setModToken(res.modToken));
    return res.modToken;
  },

  async modLoadDashboard() {
    const [statsRes, usersRes, reportsRes] = await Promise.all([
      request<{ stats: ModStats }>('/api/mod/stats', {}, true),
      request<{ users: UserProfile[] }>('/api/mod/users', {}, true),
      request<{ reports: ReportItem[] }>('/api/mod/reports', {}, true),
    ]);
    return {
      stats: statsRes.stats,
      users: usersRes.users,
      reports: reportsRes.reports,
    };
  },

  async modToggleBan(userId: string, isBanned: boolean) {
    await request(`/api/mod/users/${userId}/ban`, {
      method: 'POST',
      body: JSON.stringify({ isBanned }),
    }, true);
  },

  async modResolveReport(reportId: string) {
    await request(`/api/mod/reports/${reportId}/resolve`, { method: 'POST' }, true);
  },

  modLogout() {
    store.dispatch(clearModToken());
  },

  async logout() {
    await secureStorage.removeItem(TOKEN_KEY);
    store.dispatch(setActivePeer(null));
    store.dispatch(logoutState());
  },
};
