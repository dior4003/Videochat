import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { UserProfile } from '../../models/types';

interface AuthState {
  token: string;
  modToken: string;
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  token: '',
  modToken: '',
  user: null,
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuthLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
      if (action.payload) state.error = null;
    },
    setAuthError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
      state.loading = false;
    },
    setAuthenticated(state, action: PayloadAction<{ token: string; user: UserProfile }>) {
      state.token = action.payload.token;
      state.user = action.payload.user;
      state.loading = false;
      state.error = null;
    },
    setModToken(state, action: PayloadAction<string>) {
      state.modToken = action.payload;
    },
    clearModToken(state) {
      state.modToken = '';
    },
    updateCurrentUser(state, action: PayloadAction<UserProfile>) {
      state.user = action.payload;
    },
    logoutState(state) {
      state.token = '';
      state.modToken = '';
      state.user = null;
      state.error = null;
    },
  },
});

export const {
  setAuthLoading,
  setAuthError,
  setAuthenticated,
  setModToken,
  clearModToken,
  updateCurrentUser,
  logoutState,
} = authSlice.actions;

export default authSlice.reducer;
