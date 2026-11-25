import React, { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSelector } from 'react-redux';
import { RootState } from '../../store/store';
import { ApiController } from '../../controllers/ApiController';
import { SocketController } from '../../controllers/SocketController';
import { DARK_THEME, LIGHT_THEME } from '../theme/colors';

export const AuthScreen: React.FC = () => {
  const { loading, error } = useSelector((s: RootState) => s.auth);
  const { serverUrl, darkTheme, googleClientId } = useSelector((s: RootState) => s.settings);
  const theme = darkTheme ? DARK_THEME : LIGHT_THEME;

  const [isRegister, setIsRegister] = useState(false);
  const [urlInput, setUrlInput] = useState(serverUrl);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (Platform.OS !== 'web' || !googleClientId || typeof document === 'undefined') return;
    if (document.getElementById('gsi-script')) return;
    const script = document.createElement('script');
    script.id = 'gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      const g = (window as any).google;
      if (g?.accounts?.id) {
        g.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (res: any) => {
            const ok = await ApiController.loginWithGoogle(res.credential);
            if (ok) {
              SocketController.connect();
              ApiController.refreshLists().catch(() => {});
            }
          },
        });
      }
    };
    document.body.appendChild(script);
  }, [googleClientId]);

  const handleSubmit = async () => {
    if (!(await ApiController.saveServerUrl(urlInput))) return;
    const ok = isRegister
      ? await ApiController.register({ displayName, email, username, phone, password })
      : await ApiController.login(identifier, password);
    if (ok) {
      SocketController.connect();
      ApiController.refreshLists().catch(() => {});
    }
  };

  const handleGooglePress = () => {
    if (!googleClientId) {
      Alert.alert('Google OAuth', 'Serverdagi .env faylida GOOGLE_CLIENT_ID ni kiriting.');
      return;
    }
    if (Platform.OS === 'web') {
      const g = (window as any).google;
      if (g?.accounts?.id) {
        g.accounts.id.prompt();
      } else {
        Alert.alert('Google OAuth', 'Google SDK yuklanmadi.');
      }
    } else {
      Alert.alert('Google OAuth', 'iOS/Android buildda Google Sign-In uchun Expo Dev Client / native SHA-1 sozlang.');
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { backgroundColor: theme.bg }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.brandRow}>
          <View style={[styles.logo, { backgroundColor: theme.primary }]}>
            <Text style={styles.logoText}>PL</Text>
          </View>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>PulseLink</Text>
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
              Web • iOS • Android (React Native + Redux)
            </Text>
          </View>
        </View>

        <Text style={[styles.label, { color: theme.textMuted }]}>Server manzili</Text>
        <TextInput
          value={urlInput}
          onChangeText={setUrlInput}
          style={[styles.input, { color: theme.text, backgroundColor: theme.bg, borderColor: theme.border }]}
          autoCapitalize="none"
        />

        <View style={[styles.tabs, { backgroundColor: theme.bg }]}>
          <TouchableOpacity
            onPress={() => setIsRegister(false)}
            style={[styles.tab, !isRegister && { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.tabText, { color: !isRegister ? '#FFF' : theme.textMuted }]}>Kirish</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setIsRegister(true)}
            style={[styles.tab, isRegister && { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.tabText, { color: isRegister ? '#FFF' : theme.textMuted }]}>Ro‘yxatdan o‘tish</Text>
          </TouchableOpacity>
        </View>

        {isRegister ? (
          <>
            <TextInput
              placeholder="Ism va familiya"
              placeholderTextColor={theme.textMuted}
              value={displayName}
              onChangeText={setDisplayName}
              style={[styles.input, { color: theme.text, backgroundColor: theme.bg, borderColor: theme.border }]}
            />
            <TextInput
              placeholder="Email manzili"
              placeholderTextColor={theme.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[styles.input, { color: theme.text, backgroundColor: theme.bg, borderColor: theme.border }]}
            />
            <TextInput
              placeholder="Username (ixtiyoriy)"
              placeholderTextColor={theme.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              style={[styles.input, { color: theme.text, backgroundColor: theme.bg, borderColor: theme.border }]}
            />
            <TextInput
              placeholder="Telefon (ixtiyoriy)"
              placeholderTextColor={theme.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              style={[styles.input, { color: theme.text, backgroundColor: theme.bg, borderColor: theme.border }]}
            />
          </>
        ) : (
          <TextInput
            placeholder="Email yoki username"
            placeholderTextColor={theme.textMuted}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            style={[styles.input, { color: theme.text, backgroundColor: theme.bg, borderColor: theme.border }]}
          />
        )}

        <TextInput
          placeholder="Parol"
          placeholderTextColor={theme.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={[styles.input, { color: theme.text, backgroundColor: theme.bg, borderColor: theme.border }]}
        />

        {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}

        <TouchableOpacity
          disabled={loading}
          onPress={handleSubmit}
          style={[styles.btnPrimary, { backgroundColor: theme.primary }]}
        >
          <Text style={styles.btnText}>
            {loading ? 'Kutilmoqda...' : isRegister ? 'Email bilan hisob yaratish' : 'Email orqali kirish'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          disabled={loading}
          onPress={handleGooglePress}
          style={[styles.btnOutline, { borderColor: theme.border }]}
        >
          <Text style={[styles.btnText, { color: theme.text }]}>Google orqali davom etish</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 440, borderRadius: 24, padding: 24, borderWidth: 1, gap: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  logo: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  logoText: { color: '#FFF', fontWeight: '800', fontSize: 18 },
  title: { fontSize: 22, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '600' },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: 12, gap: 4 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  tabText: { fontWeight: '700', fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  error: { fontSize: 13, fontWeight: '600' },
  btnPrimary: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnOutline: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1 },
  btnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
});
