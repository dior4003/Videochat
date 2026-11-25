import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  name: string;
  color: string;
  online?: boolean;
  size?: number;
}

export const UserAvatar: React.FC<Props> = ({ name, color, online = false, size = 44 }) => {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || '?';

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.box,
          {
            width: size,
            height: size,
            borderRadius: Math.round(size * 0.3),
            backgroundColor: color || '#6366F1',
          },
        ]}
      >
        <Text style={[styles.text, { fontSize: Math.round(size * 0.36) }]}>{initials}</Text>
      </View>
      {online && <View style={styles.dot} />}
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  dot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#06B6D4',
    borderWidth: 2,
    borderColor: '#131B2E',
  },
});
