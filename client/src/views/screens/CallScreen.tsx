import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store/store';
import { setCamEnabled, setMicEnabled, setVideoQuality, VideoQuality } from '../../store/slices/callSlice';
import { SocketController } from '../../controllers/SocketController';
import { WebRtcController } from '../../controllers/WebRtcController';
import { UserAvatar } from '../components/UserAvatar';

const WebVideoElement: React.FC<{ stream: any; muted?: boolean; style?: any }> = ({
  stream,
  muted = false,
  style,
}) => {
  const ref = useRef<any>(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  return React.createElement('video', {
    ref,
    autoPlay: true,
    playsInline: true,
    muted,
    style,
  });
};

export const CallScreen: React.FC = () => {
  const dispatch = useDispatch();
  const { incomingCall, activeCall, micEnabled, camEnabled, onHold, peerOnHold, iceState, videoQuality, rttMs } =
    useSelector((s: RootState) => s.call);
  const [, setTick] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const unsub = WebRtcController.subscribe(() => setTick((t) => t + 1));
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!activeCall?.connected) {
      setElapsedSec(0);
      return;
    }
    const started = Date.now();
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [activeCall?.connected]);

  useEffect(() => {
    if (!incomingCall || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const beep = () => {
      try {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.18);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.45);
      } catch {}
    };
    beep();
    const id = setInterval(beep, 1800);
    return () => clearInterval(id);
  }, [incomingCall]);

  if (incomingCall) {
    return (
      <View style={styles.incomingOverlay}>
        <View style={styles.incomingCard}>
          <UserAvatar name={incomingCall.caller.displayName} color={incomingCall.caller.avatarColor} online size={84} />
          <Text style={styles.callBadge}>
            {incomingCall.callType === 'video' ? 'VIDEO QO‘NG‘IROQ' : 'AUDIO QO‘NG‘IROQ'}
          </Text>
          <Text style={styles.callerName}>{incomingCall.caller.displayName}</Text>
          <Text style={styles.subText}>Sizga qo‘ng‘iroq qilmoqda...</Text>
          <View style={styles.ringRow}>
            <TouchableOpacity
              onPress={() => SocketController.rejectIncomingCall()}
              style={[styles.circleBtn, { backgroundColor: '#F43F5E' }]}
            >
              <Text style={styles.circleText}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => SocketController.acceptIncomingCall()}
              style={[styles.circleBtn, { backgroundColor: '#10B981' }]}
            >
              <Text style={styles.circleText}>✓</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (!activeCall) return null;

  const localStream = WebRtcController.getLocalStream();
  const remoteStream = WebRtcController.getRemoteStream();
  const NativeRtcView = WebRtcController.getNativeRtcView();
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');

  const cycleQuality = () => {
    const order: VideoQuality[] = ['hd', 'sd', 'low'];
    const next = order[(order.indexOf(videoQuality) + 1) % order.length];
    dispatch(setVideoQuality(next));
    WebRtcController.setVideoQuality(next);
  };

  return (
    <View style={styles.activeOverlay}>
      <View style={styles.topBar}>
        <Text style={styles.callerName}>{activeCall.peer.displayName}</Text>
        <Text style={styles.subText}>
          {activeCall.connected ? `${mm}:${ss}` : 'Ulanmoqda...'}
          {rttMs !== null ? ` • RTT: ${rttMs}ms` : ''}
          {activeCall.callType === 'video' ? ` • ${videoQuality.toUpperCase()}` : ''}
        </Text>
        {(onHold || peerOnHold) && (
          <View style={styles.holdBanner}>
            <Text style={{ color: '#FBBF24', fontWeight: '700', fontSize: 12 }}>
              {onHold ? '⏸️ Siz kutish rejimiga qo‘ydingiz' : '⏸️ Suhbatdosh kutish rejimiga qo‘ydi'}
            </Text>
          </View>
        )}
        {(iceState === 'disconnected' || iceState === 'failed') && (
          <TouchableOpacity onPress={() => SocketController.restartIce()} style={styles.reconnectBtn}>
            <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>🔄 Signal yo‘qoldi — Aloqani tiklash</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.stage}>
        {activeCall.callType === 'video' ? (
          Platform.OS === 'web' ? (
            <>
              {remoteStream && (
                <WebVideoElement
                  stream={remoteStream}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )}
              {localStream && (
                <WebVideoElement
                  stream={localStream}
                  muted
                  style={{
                    position: 'absolute',
                    right: 16,
                    bottom: 16,
                    width: 140,
                    height: 190,
                    borderRadius: 14,
                    objectFit: 'cover',
                    border: '2px solid rgba(255,255,255,0.25)',
                  }}
                />
              )}
            </>
          ) : (
            <>
              {NativeRtcView && remoteStream && (
                <NativeRtcView streamURL={remoteStream.toURL()} style={StyleSheet.absoluteFill} objectFit="cover" />
              )}
              {NativeRtcView && localStream && (
                <NativeRtcView
                  streamURL={localStream.toURL()}
                  style={styles.nativePip}
                  objectFit="cover"
                  zOrder={1}
                />
              )}
            </>
          )
        ) : (
          <View style={{ alignItems: 'center', gap: 14 }}>
            <UserAvatar name={activeCall.peer.displayName} color={activeCall.peer.avatarColor} online size={96} />
            <Text style={styles.subText}>Ovozli aloqa faol</Text>
          </View>
        )}
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          onPress={() => {
            const next = !micEnabled;
            dispatch(setMicEnabled(next));
            WebRtcController.setMicEnabled(next);
          }}
          style={[styles.ctrlBtn, !micEnabled && { backgroundColor: '#F43F5E' }]}
        >
          <Text style={styles.ctrlText}>🎙️</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => SocketController.toggleHold()}
          style={[styles.ctrlBtn, onHold && { backgroundColor: '#F59E0B' }]}
        >
          <Text style={styles.ctrlText}>⏸️</Text>
        </TouchableOpacity>

        {activeCall.callType === 'video' && (
          <>
            <TouchableOpacity
              onPress={() => {
                const next = !camEnabled;
                dispatch(setCamEnabled(next));
                WebRtcController.setCamEnabled(next);
              }}
              style={[styles.ctrlBtn, !camEnabled && { backgroundColor: '#F43F5E' }]}
            >
              <Text style={styles.ctrlText}>📷</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={cycleQuality} style={styles.ctrlBtn}>
              <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 12 }}>{videoQuality.toUpperCase()}</Text>
            </TouchableOpacity>
            {Platform.OS !== 'web' && (
              <TouchableOpacity onPress={() => WebRtcController.switchCamera()} style={styles.ctrlBtn}>
                <Text style={styles.ctrlText}>🔄</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <TouchableOpacity
          onPress={() => SocketController.hangupActiveCall()}
          style={[styles.ctrlBtn, { backgroundColor: '#F43F5E' }]}
        >
          <Text style={styles.ctrlText}>📞</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  incomingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,9,17,0.86)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 50,
  },
  incomingCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#131B2E',
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    gap: 10,
  },
  callBadge: { color: '#06B6D4', fontSize: 12, fontWeight: '800', marginTop: 6 },
  callerName: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  subText: { color: '#94A3B8', fontSize: 14 },
  holdBanner: { backgroundColor: 'rgba(245,158,11,0.18)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, marginTop: 4 },
  reconnectBtn: { backgroundColor: '#6366F1', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginTop: 4 },
  ringRow: { flexDirection: 'row', gap: 28, marginTop: 18 },
  circleBtn: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  circleText: { color: '#FFF', fontSize: 22, fontWeight: '800' },
  activeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#060911',
    padding: 20,
    justifyContent: 'space-between',
    zIndex: 50,
  },
  topBar: { paddingTop: 28, alignItems: 'center', gap: 4 },
  stage: {
    flex: 1,
    marginVertical: 16,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nativePip: {
    position: 'absolute',
    right: 14,
    top: 14,
    width: 110,
    height: 160,
    borderRadius: 14,
  },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 12, paddingBottom: 16, flexWrap: 'wrap' },
  ctrlBtn: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlText: { fontSize: 20 },
});
