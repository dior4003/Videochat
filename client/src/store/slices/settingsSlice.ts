import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Platform } from 'react-native';
import { IceServerConfig } from '../../models/types';

function defaultServerUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin.includes(':3000')
      ? window.location.origin
      : 'http://localhost:3000';
  }
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  return 'http://localhost:3000'; // iOS simulator
}

interface SettingsState {
  serverUrl: string;
  darkTheme: boolean;
  devMode: boolean;
  wsConnected: boolean;
  pingMs: number | null;
  dbEngine: string;
  googleClientId: string;
  iceServers: IceServerConfig[];
  devLogs: string[];
}

const initialState: SettingsState = {
  serverUrl: defaultServerUrl(),
  darkTheme: true,
  devMode: false,
  wsConnected: false,
  pingMs: null,
  dbEngine: 'MySQL/MariaDB',
  googleClientId: '',
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  devLogs: [],
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setServerUrl(state, action: PayloadAction<string>) {
      state.serverUrl = action.payload.trim().replace(/\/+$/, '');
    },
    toggleDarkTheme(state) {
      state.darkTheme = !state.darkTheme;
    },
    setDevMode(state, action: PayloadAction<boolean>) {
      state.devMode = action.payload;
    },
    setWsConnected(state, action: PayloadAction<boolean>) {
      state.wsConnected = action.payload;
    },
    setPingMs(state, action: PayloadAction<number>) {
      state.pingMs = action.payload;
    },
    setServerConfig(
      state,
      action: PayloadAction<{ googleClientId: string; database: string; iceServers: IceServerConfig[] }>
    ) {
      state.googleClientId = action.payload.googleClientId;
      state.dbEngine = action.payload.database;
      if (action.payload.iceServers.length) {
        state.iceServers = action.payload.iceServers;
      }
    },
    setIceServers(state, action: PayloadAction<IceServerConfig[]>) {
      if (action.payload.length) state.iceServers = action.payload;
    },
    addDevLog(state, action: PayloadAction<string>) {
      const ts = new Date().toLocaleTimeString();
      state.devLogs = [`[${ts}] ${action.payload}`, ...state.devLogs].slice(0, 35);
    },
    clearDevLogs(state) {
      state.devLogs = [];
    },
  },
});

export const {
  setServerUrl,
  toggleDarkTheme,
  setDevMode,
  setWsConnected,
  setPingMs,
  setServerConfig,
  setIceServers,
  addDevLog,
  clearDevLogs,
} = settingsSlice.actions;

export default settingsSlice.reducer;
