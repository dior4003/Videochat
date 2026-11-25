import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  CallRecord,
  ChatMessage,
  ChatSummary,
  FriendItem,
  SearchResultItem,
  UserProfile,
} from '../../models/types';

interface ChatState {
  chats: ChatSummary[];
  users: UserProfile[];
  calls: CallRecord[];
  friends: FriendItem[];
  incomingRequests: FriendItem[];
  searchResults: SearchResultItem[];
  activePeer: UserProfile | null;
  messages: ChatMessage[];
  peerTyping: boolean;
}

const initialState: ChatState = {
  chats: [],
  users: [],
  calls: [],
  friends: [],
  incomingRequests: [],
  searchResults: [],
  activePeer: null,
  messages: [],
  peerTyping: false,
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setChats(state, action: PayloadAction<ChatSummary[]>) {
      state.chats = action.payload;
    },
    setUsers(state, action: PayloadAction<UserProfile[]>) {
      state.users = action.payload;
    },
    setCalls(state, action: PayloadAction<CallRecord[]>) {
      state.calls = action.payload;
    },
    setFriendsData(state, action: PayloadAction<{ friends: FriendItem[]; incomingRequests: FriendItem[] }>) {
      state.friends = action.payload.friends;
      state.incomingRequests = action.payload.incomingRequests;
    },
    setSearchResults(state, action: PayloadAction<SearchResultItem[]>) {
      state.searchResults = action.payload;
    },
    setActivePeer(state, action: PayloadAction<UserProfile | null>) {
      state.activePeer = action.payload;
      state.peerTyping = false;
      if (!action.payload) state.messages = [];
    },
    setMessages(state, action: PayloadAction<ChatMessage[]>) {
      state.messages = action.payload;
    },
    appendMessage(state, action: PayloadAction<ChatMessage>) {
      const msg = action.payload;
      const peer = state.activePeer;
      if (peer && (msg.senderId === peer.id || msg.receiverId === peer.id)) {
        if (!state.messages.some((m) => m.id === msg.id)) {
          state.messages.push(msg);
        }
      }
    },
    markOutgoingRead(state, action: PayloadAction<string>) {
      if (state.activePeer?.id === action.payload) {
        state.messages.forEach((m) => {
          if (m.receiverId === action.payload) m.status = 'read';
        });
      }
    },
    setPeerTyping(state, action: PayloadAction<{ userId: string; isTyping: boolean }>) {
      if (state.activePeer?.id === action.payload.userId) {
        state.peerTyping = action.payload.isTyping;
      }
    },
    updatePresence(state, action: PayloadAction<{ userId: string; online: boolean }>) {
      const { userId, online } = action.payload;
      state.users.forEach((u) => { if (u.id === userId) u.online = online; });
      state.chats.forEach((c) => { if (c.peer.id === userId) c.peer.online = online; });
      state.friends.forEach((f) => { if (f.peer.id === userId) f.peer.online = online; });
      if (state.activePeer?.id === userId) state.activePeer.online = online;
    },
  },
});

export const {
  setChats,
  setUsers,
  setCalls,
  setFriendsData,
  setSearchResults,
  setActivePeer,
  setMessages,
  appendMessage,
  markOutgoingRead,
  setPeerTyping,
  updatePresence,
} = chatSlice.actions;

export default chatSlice.reducer;
