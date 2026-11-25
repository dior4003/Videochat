import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Provider, useSelector } from 'react-redux';
import { StatusBar } from 'expo-status-bar';
import { RootState, store } from './src/store/store';
import { ApiController } from './src/controllers/ApiController';
import { SocketController } from './src/controllers/SocketController';
import { AuthScreen } from './src/views/screens/AuthScreen';
import { HomeScreen } from './src/views/screens/HomeScreen';
import { ChatScreen } from './src/views/screens/ChatScreen';
import { CallScreen } from './src/views/screens/CallScreen';

const AppRouter: React.FC = () => {
  const user = useSelector((s: RootState) => s.auth.user);
  const activePeer = useSelector((s: RootState) => s.chat.activePeer);
  const darkTheme = useSelector((s: RootState) => s.settings.darkTheme);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    (async () => {
      const ok = await ApiController.restoreSession();
      if (ok) {
        SocketController.connect();
        ApiController.refreshLists().catch(() => {});
      }
      setBooting(false);
    })();
  }, []);

  if (booting) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0E17', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#6366F1" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={darkTheme ? 'light' : 'dark'} />
      {!user ? <AuthScreen /> : activePeer ? <ChatScreen /> : <HomeScreen />}
      <CallScreen />
    </View>
  );
};

export default function App() {
  return (
    <Provider store={store}>
      <AppRouter />
    </Provider>
  );
}
