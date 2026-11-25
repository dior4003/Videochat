import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { UserProfile } from '../../models/types';

export type VideoQuality = 'hd' | 'sd' | 'low';

interface CallState {
  incomingCall: { callId: string; callType: 'audio' | 'video'; caller: UserProfile } | null;
  activeCall: { callId: string | null; callType: 'audio' | 'video'; peer: UserProfile; connected: boolean } | null;
  micEnabled: boolean;
  camEnabled: boolean;
  onHold: boolean;
  peerOnHold: boolean;
  iceState: string;
  videoQuality: VideoQuality;
  rttMs: number | null;
}

const initialState: CallState = {
  incomingCall: null,
  activeCall: null,
  micEnabled: true,
  camEnabled: true,
  onHold: false,
  peerOnHold: false,
  iceState: 'new',
  videoQuality: 'hd',
  rttMs: null,
};

const callSlice = createSlice({
  name: 'call',
  initialState,
  reducers: {
    setIncomingCall(state, action: PayloadAction<CallState['incomingCall']>) {
      state.incomingCall = action.payload;
    },
    startActiveCall(
      state,
      action: PayloadAction<{ callId: string | null; callType: 'audio' | 'video'; peer: UserProfile }>
    ) {
      state.incomingCall = null;
      state.activeCall = { ...action.payload, connected: false };
      state.micEnabled = true;
      state.camEnabled = action.payload.callType === 'video';
      state.onHold = false;
      state.peerOnHold = false;
      state.iceState = 'checking';
      state.rttMs = null;
    },
    setActiveCallId(state, action: PayloadAction<string>) {
      if (state.activeCall) state.activeCall.callId = action.payload;
    },
    setCallConnected(state, action: PayloadAction<boolean>) {
      if (state.activeCall) state.activeCall.connected = action.payload;
    },
    setMicEnabled(state, action: PayloadAction<boolean>) {
      state.micEnabled = action.payload;
    },
    setCamEnabled(state, action: PayloadAction<boolean>) {
      state.camEnabled = action.payload;
    },
    setOnHold(state, action: PayloadAction<boolean>) {
      state.onHold = action.payload;
    },
    setPeerOnHold(state, action: PayloadAction<boolean>) {
      state.peerOnHold = action.payload;
    },
    setIceState(state, action: PayloadAction<string>) {
      state.iceState = action.payload;
    },
    setVideoQuality(state, action: PayloadAction<VideoQuality>) {
      state.videoQuality = action.payload;
    },
    setRttMs(state, action: PayloadAction<number | null>) {
      state.rttMs = action.payload;
    },
    resetCallState(state) {
      state.incomingCall = null;
      state.activeCall = null;
      state.micEnabled = true;
      state.camEnabled = true;
      state.onHold = false;
      state.peerOnHold = false;
      state.iceState = 'new';
      state.rttMs = null;
    },
  },
});

export const {
  setIncomingCall,
  startActiveCall,
  setActiveCallId,
  setCallConnected,
  setMicEnabled,
  setCamEnabled,
  setOnHold,
  setPeerOnHold,
  setIceState,
  setVideoQuality,
  setRttMs,
  resetCallState,
} = callSlice.actions;

export default callSlice.reducer;
