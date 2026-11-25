import { Alert } from 'react-native';
import { store } from '../store/store';
import {
  appendMessage,
  markOutgoingRead,
  setPeerTyping,
  updatePresence,
} from '../store/slices/chatSlice';
import {
  resetCallState,
  setActiveCallId,
  setIncomingCall,
  setOnHold,
  setPeerOnHold,
  startActiveCall,
} from '../store/slices/callSlice';
import { addDevLog, setPingMs, setWsConnected } from '../store/slices/settingsSlice';
import { ApiController } from './ApiController';
import { WebRtcController } from './WebRtcController';
import { UserProfile } from '../models/types';

class SocketManager {
  private ws: WebSocket | null = null;
  private reconnectTimer: any = null;

  private retry = 0;
  private generation = 0; // eski socket'ning onclose'i yangisini buzmasligi uchun

  private scheduleReconnect() {
    clearTimeout(this.reconnectTimer);
    // Eksponensial backoff (1s, 2s, 4s ... maks 30s) + jitter
    const delay = Math.min(30000, 1000 * 2 ** this.retry) + Math.floor(Math.random() * 500);
    this.retry += 1;
    this.reconnectTimer = setTimeout(() => {
      if (store.getState().auth.token) this.connect();
    }, delay);
  }

  async connect() {
    this.disconnect();
    const gen = ++this.generation;
    const { auth, settings } = store.getState();
    if (!auth.token) return;

    // Token URL'ga qo'yilmaydi: bir martalik (30 soniyalik) bilet olinadi
    let ticket: string;
    try {
      ticket = await ApiController.wsTicket();
    } catch {
      if (gen === this.generation) this.scheduleReconnect();
      return;
    }
    if (gen !== this.generation) return;
    ApiController.loadIce().catch(() => {}); // TURN bilan yangilangan ICE serverlar

    const wsBase = settings.serverUrl
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://');

    const ws = new WebSocket(`${wsBase}?ticket=${encodeURIComponent(ticket)}`);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      store.dispatch(setWsConnected(true));
      store.dispatch(addDevLog('WS connected'));
      this.send('ping', { ts: Date.now() });
    };

    ws.onclose = (ev: any) => {
      if (gen !== this.generation) return;
      store.dispatch(setWsConnected(false));
      store.dispatch(addDevLog('WS disconnected'));
      // 4002: sessiya bekor qilingan, 4003: bloklangan -> qayta ulanmasdan chiqamiz
      if (ev && (ev.code === 4002 || ev.code === 4003)) {
        ApiController.logout().catch(() => {});
        return;
      }
      this.scheduleReconnect();
    };

    ws.onmessage = async (ev) => {
      let parsed: { event: string; data: any };
      try {
        parsed = JSON.parse(ev.data);
      } catch {
        return;
      }
      const { event, data } = parsed;
      if (event !== 'pong') store.dispatch(addDevLog(`WS <- ${event}`));

      switch (event) {
        case 'pong':
          store.dispatch(setPingMs(Date.now() - (data.ts || Date.now())));
          break;
        case 'presence:update':
          store.dispatch(updatePresence(data));
          break;
        case 'friend:update':
          ApiController.refreshLists().catch(() => {});
          break;
        case 'chat:message': {
          store.dispatch(appendMessage(data));
          const activePeer = store.getState().chat.activePeer;
          if (activePeer && data.senderId === activePeer.id) {
            this.send('chat:read', { peerId: activePeer.id });
          }
          ApiController.refreshLists().catch(() => {});
          break;
        }
        case 'chat:typing':
          store.dispatch(setPeerTyping(data));
          break;
        case 'chat:read':
          store.dispatch(markOutgoingRead(data.byUserId));
          break;
        case 'call:created':
          store.dispatch(setActiveCallId(data.callId));
          break;
        case 'call:incoming':
          store.dispatch(setIncomingCall(data));
          break;
        case 'call:hold':
          store.dispatch(setPeerOnHold(Boolean(data.onHold)));
          break;
        case 'call:accepted': {
          store.dispatch(setActiveCallId(data.callId));
          const active = store.getState().call.activeCall;
          if (!active) return;
          WebRtcController.createPeerConnection((candidate) => {
            this.send('call:ice', { targetId: active.peer.id, callId: data.callId, candidate });
          });
          const offer = await WebRtcController.createOffer();
          this.send('call:offer', { targetId: active.peer.id, callId: data.callId, sdp: offer });
          break;
        }
        case 'call:offer': {
          if (!store.getState().call.activeCall) return;
          if (!WebRtcController.getRemoteStream()) {
            WebRtcController.createPeerConnection((candidate) => {
              this.send('call:ice', { targetId: data.fromId, callId: data.callId, candidate });
            });
          }
          const answer = await WebRtcController.handleOffer(data.sdp);
          this.send('call:answer', { targetId: data.fromId, callId: data.callId, sdp: answer });
          break;
        }
        case 'call:answer':
          await WebRtcController.handleAnswer(data.sdp);
          break;
        case 'call:ice':
          await WebRtcController.addIceCandidate(data.candidate);
          break;
        case 'call:rejected':
        case 'call:timeout':
        case 'call:unavailable':
          Alert.alert('Qo‘ng‘iroq', data.reason || 'Qo‘ng‘iroq yakunlandi');
          WebRtcController.close();
          store.dispatch(resetCallState());
          ApiController.refreshLists().catch(() => {});
          break;
        case 'call:hangup':
          WebRtcController.close();
          store.dispatch(resetCallState());
          ApiController.refreshLists().catch(() => {});
          break;
      }
    };
  }

  send(event: string, data: any) {
    if (this.ws && this.ws.readyState === 1) {
      if (event !== 'ping') store.dispatch(addDevLog(`WS -> ${event}`));
      this.ws.send(JSON.stringify({ event, data }));
    }
  }

  async initiateCall(peer: UserProfile, callType: 'audio' | 'video') {
    await WebRtcController.startLocalMedia(callType === 'video');
    store.dispatch(startActiveCall({ callId: null, callType, peer }));
    this.send('call:invite', { receiverId: peer.id, callType });
  }

  async acceptIncomingCall() {
    const incoming = store.getState().call.incomingCall;
    if (!incoming) return;
    await WebRtcController.startLocalMedia(incoming.callType === 'video');
    store.dispatch(
      startActiveCall({
        callId: incoming.callId,
        callType: incoming.callType,
        peer: incoming.caller,
      })
    );
    this.send('call:accept', { callId: incoming.callId });
  }

  toggleHold() {
    const { activeCall, onHold } = store.getState().call;
    if (!activeCall || !activeCall.callId) return;
    const next = !onHold;
    store.dispatch(setOnHold(next));
    WebRtcController.setHold(next);
    this.send('call:hold', { callId: activeCall.callId, targetId: activeCall.peer.id, onHold: next });
  }

  async restartIce() {
    const { activeCall } = store.getState().call;
    if (!activeCall || !activeCall.callId) return;
    const offer = await WebRtcController.createIceRestartOffer();
    if (offer) {
      this.send('call:offer', { targetId: activeCall.peer.id, callId: activeCall.callId, sdp: offer });
    }
  }

  rejectIncomingCall() {
    const incoming = store.getState().call.incomingCall;
    if (!incoming) return;
    this.send('call:reject', { callId: incoming.callId });
    store.dispatch(resetCallState());
  }

  hangupActiveCall() {
    const active = store.getState().call.activeCall;
    if (active) {
      this.send('call:hangup', { callId: active.callId, targetId: active.peer.id });
    }
    WebRtcController.close();
    store.dispatch(resetCallState());
    ApiController.refreshLists().catch(() => {});
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    this.generation += 1;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const SocketController = new SocketManager();
