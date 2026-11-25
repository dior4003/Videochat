import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store/store';
import { setActivePeer } from '../../store/slices/chatSlice';
import { ApiController } from '../../controllers/ApiController';
import { SocketController } from '../../controllers/SocketController';
import { DARK_THEME, LIGHT_THEME } from '../theme/colors';
import { UserAvatar } from '../components/UserAvatar';

declare const require: any;

export const ChatScreen: React.FC = () => {
  const dispatch = useDispatch();
  const { user, token } = useSelector((s: RootState) => s.auth);
  const { activePeer, messages, peerTyping } = useSelector((s: RootState) => s.chat);
  const { darkTheme, serverUrl } = useSelector((s: RootState) => s.settings);
  const theme = darkTheme ? DARK_THEME : LIGHT_THEME;
  const [text, setText] = useState('');
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  if (!activePeer || !user) return null;

  const sendMessage = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    SocketController.send('chat:send', {
      receiverId: activePeer.id,
      text: trimmed,
      type: 'text',
    });
    setText('');
    SocketController.send('chat:typing', { receiverId: activePeer.id, isTyping: false });
  };

  const handleAttach = async () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,.pdf,.txt,.zip';
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const uploaded = await ApiController.uploadMedia(file.name, file.type, String(reader.result));
            SocketController.send('chat:send', {
              receiverId: activePeer.id,
              text: uploaded.fileName,
              type: uploaded.type,
              mediaUrl: uploaded.url,
            });
          } catch (err: any) {
            Alert.alert('Xatolik', err.message);
          }
        };
        reader.readAsDataURL(file);
      };
      input.click();
      return;
    }

    try {
      const ImagePicker = require('expo-image-picker');
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        base64: true,
        quality: 0.75,
      });
      if (!res.canceled && res.assets?.[0]?.base64) {
        const asset = res.assets[0];
        const uploaded = await ApiController.uploadMedia(
          asset.fileName || 'photo.jpg',
          asset.mimeType || 'image/jpeg',
          asset.base64
        );
        SocketController.send('chat:send', {
          receiverId: activePeer.id,
          text: uploaded.fileName,
          type: uploaded.type,
          mediaUrl: uploaded.url,
        });
      }
    } catch (err: any) {
      Alert.alert('Xatolik', err.message || 'Rasm tanlashda xatolik');
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TouchableOpacity onPress={() => dispatch(setActivePeer(null))} style={styles.backBtn}>
          <Text style={{ color: theme.primary, fontSize: 18, fontWeight: '800' }}>←</Text>
        </TouchableOpacity>
        <UserAvatar name={activePeer.displayName} color={activePeer.avatarColor} online={activePeer.online} size={38} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.peerName, { color: theme.text }]}>{activePeer.displayName}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>
            {peerTyping ? 'yozmoqda...' : activePeer.online ? 'Onlayn' : 'Oflayn'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => SocketController.initiateCall(activePeer, 'audio')}
          style={[styles.callPill, { backgroundColor: theme.elevated }]}
        >
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: 12 }}>Audio</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => SocketController.initiateCall(activePeer, 'video')}
          style={[styles.callPill, { backgroundColor: theme.primary }]}
        >
          <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 12 }}>Video</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.msgList}
        renderItem={({ item }) => {
          const isOut = item.senderId === user.id;
          // Token URL'ga qo'shilmaydi: rasm Authorization sarlavhasi bilan, fayl esa qisqa muddatli havola bilan ochiladi
          const mediaPath = item.mediaUrl && /^\/uploads\/[0-9a-f-]{36}\.[a-z]+$/.test(item.mediaUrl) ? item.mediaUrl : null;
          const imageSource = mediaPath
            ? { uri: `${serverUrl}${mediaPath}`, headers: { Authorization: `Bearer ${token}` } }
            : null;
          return (
            <View style={[styles.msgRow, isOut ? styles.outRow : styles.inRow]}>
              <View style={[styles.bubble, { backgroundColor: isOut ? theme.msgOut : theme.msgIn }]}>
                {item.type === 'image' && imageSource ? (
                  <Image
                    source={imageSource}
                    style={{ width: 200, height: 160, borderRadius: 10, marginBottom: 4 }}
                  />
                ) : null}
                {item.type === 'file' && mediaPath ? (
                  <TouchableOpacity onPress={async () => {
                    try {
                      Linking.openURL(await ApiController.mediaLink(mediaPath));
                    } catch {
                      /* havola olinmadi */
                    }
                  }}>
                    <Text style={{ color: isOut ? '#FFF' : theme.primary, textDecorationLine: 'underline', fontWeight: '700' }}>
                      📄 {item.text || 'Faylni ochish'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={{ color: isOut ? '#FFF' : theme.text, fontSize: 14.5 }}>{item.text}</Text>
                )}
              </View>
              {isOut && (
                <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>
                  {item.status === 'read' ? '✓✓' : '✓'}
                </Text>
              )}
            </View>
          );
        }}
      />

      <View style={[styles.composer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TouchableOpacity onPress={handleAttach} style={styles.attachBtn}>
          <Text style={{ fontSize: 20 }}>📎</Text>
        </TouchableOpacity>
        <TextInput
          value={text}
          onChangeText={(val) => {
            setText(val);
            SocketController.send('chat:typing', { receiverId: activePeer.id, isTyping: val.length > 0 });
          }}
          onSubmitEditing={sendMessage}
          placeholder="Xabar yozing..."
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { color: theme.text, backgroundColor: theme.bg, borderColor: theme.border }]}
        />
        <TouchableOpacity onPress={sendMessage} style={[styles.sendBtn, { backgroundColor: theme.primary }]}>
          <Text style={{ color: '#FFF', fontWeight: '800' }}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 46,
    paddingBottom: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: { padding: 6 },
  peerName: { fontSize: 16, fontWeight: '700' },
  callPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  msgList: { padding: 14, gap: 8 },
  msgRow: { maxWidth: '78%' },
  outRow: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  inRow: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderTopWidth: 1 },
  attachBtn: { paddingHorizontal: 6, paddingVertical: 6 },
  input: { flex: 1, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  sendBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
