import { Platform } from 'react-native';
import { store } from '../store/store';
import { addDevLog } from '../store/slices/settingsSlice';
import { setCallConnected, setIceState, setRttMs, VideoQuality } from '../store/slices/callSlice';

declare const require: any;

type NativeRtcModule = {
  RTCPeerConnection: any;
  RTCSessionDescription: any;
  RTCIceCandidate: any;
  mediaDevices: any;
  RTCView: any;
};

function getRtcImpl(): NativeRtcModule {
  if (Platform.OS === 'web') {
    return {
      RTCPeerConnection: window.RTCPeerConnection,
      RTCSessionDescription: window.RTCSessionDescription,
      RTCIceCandidate: window.RTCIceCandidate,
      mediaDevices: navigator.mediaDevices,
      RTCView: null,
    };
  }
  return require('react-native-webrtc');
}

class WebRtcManager {
  private pc: any = null;
  private localStream: any = null;
  private remoteStream: any = null;
  private remoteDescSet = false;
  private pendingCandidates: any[] = [];
  private statsTimer: any = null;
  private onStreamListeners = new Set<() => void>();

  subscribe(listener: () => void) {
    this.onStreamListeners.add(listener);
    return () => this.onStreamListeners.delete(listener);
  }

  private notify() {
    this.onStreamListeners.forEach((fn) => fn());
  }

  getLocalStream() {
    return this.localStream;
  }

  getRemoteStream() {
    return this.remoteStream;
  }

  getNativeRtcView() {
    if (Platform.OS === 'web') return null;
    return getRtcImpl().RTCView;
  }

  async startLocalMedia(video: boolean) {
    const { mediaDevices } = getRtcImpl();
    this.localStream = await mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
    });
    this.notify();
    return this.localStream;
  }

  createPeerConnection(onIceCandidate: (candidate: any) => void) {
    const { RTCPeerConnection } = getRtcImpl();
    const iceServers = store.getState().settings.iceServers;
    this.remoteDescSet = false;
    this.pendingCandidates = [];
    this.pc = new RTCPeerConnection({ iceServers });

    if (this.localStream) {
      this.localStream.getTracks().forEach((track: any) => {
        this.pc.addTrack(track, this.localStream);
      });
    }

    this.pc.onicecandidate = (event: any) => {
      if (event.candidate) onIceCandidate(event.candidate);
    };

    this.pc.oniceconnectionstatechange = () => {
      const state = this.pc?.iceConnectionState || 'unknown';
      store.dispatch(setIceState(state));
      store.dispatch(addDevLog(`WebRTC ICE: ${state}`));
      if (state === 'connected' || state === 'completed') {
        store.dispatch(setCallConnected(true));
        this.startStatsPolling();
      }
    };

    this.pc.ontrack = (event: any) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.notify();
      }
    };

    return this.pc;
  }

  private startStatsPolling() {
    clearInterval(this.statsTimer);
    this.statsTimer = setInterval(async () => {
      if (!this.pc || typeof this.pc.getStats !== 'function') return;
      try {
        const stats = await this.pc.getStats();
        stats.forEach((report: any) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded' && typeof report.currentRoundTripTime === 'number') {
            store.dispatch(setRttMs(Math.round(report.currentRoundTripTime * 1000)));
          }
        });
      } catch {}
    }, 3000);
  }

  async setVideoQuality(quality: VideoQuality) {
    if (!this.pc || typeof this.pc.getSenders !== 'function') return;
    const maxBitrate = quality === 'hd' ? 1800000 : quality === 'sd' ? 650000 : 220000;
    const videoSender = this.pc.getSenders().find((s: any) => s.track?.kind === 'video');
    if (videoSender && typeof videoSender.getParameters === 'function') {
      const params = videoSender.getParameters();
      if (!params.encodings || !params.encodings.length) params.encodings = [{}];
      params.encodings[0].maxBitrate = maxBitrate;
      await videoSender.setParameters(params).catch(() => {});
      store.dispatch(addDevLog(`Video quality -> ${quality.toUpperCase()}`));
    }
  }

  async createIceRestartOffer() {
    if (!this.pc) return null;
    if (typeof this.pc.restartIce === 'function') this.pc.restartIce();
    const offer = await this.pc.createOffer({ iceRestart: true });
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  setHold(onHold: boolean) {
    this.localStream?.getTracks().forEach((t: any) => {
      t.enabled = !onHold;
    });
  }

  private async flushCandidates() {
    const { RTCIceCandidate } = getRtcImpl();
    for (const c of this.pendingCandidates) {
      await this.pc?.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
    this.pendingCandidates = [];
  }

  async createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(sdp: any) {
    const { RTCSessionDescription } = getRtcImpl();
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    this.remoteDescSet = true;
    await this.flushCandidates();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(sdp: any) {
    const { RTCSessionDescription } = getRtcImpl();
    if (this.pc) {
      await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
      this.remoteDescSet = true;
      await this.flushCandidates();
    }
  }

  async addIceCandidate(candidate: any) {
    const { RTCIceCandidate } = getRtcImpl();
    if (!this.pc || !candidate) return;
    if (!this.remoteDescSet) {
      this.pendingCandidates.push(candidate);
      return;
    }
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
  }

  setMicEnabled(enabled: boolean) {
    this.localStream?.getAudioTracks().forEach((t: any) => {
      t.enabled = enabled;
    });
  }

  setCamEnabled(enabled: boolean) {
    this.localStream?.getVideoTracks().forEach((t: any) => {
      t.enabled = enabled;
    });
  }

  switchCamera() {
    if (Platform.OS !== 'web') {
      this.localStream?.getVideoTracks().forEach((t: any) => {
        if (typeof t._switchCamera === 'function') t._switchCamera();
      });
    }
  }

  close() {
    clearInterval(this.statsTimer);
    this.remoteDescSet = false;
    this.pendingCandidates = [];
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t: any) => t.stop());
      this.localStream = null;
    }
    this.remoteStream = null;
    this.notify();
  }
}

export const WebRtcController = new WebRtcManager();
