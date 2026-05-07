import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { Card, EmptyState, Subtle } from '../components/UI';
import {
  clearNotificationInbox,
  getNotificationInbox,
  markNotificationInboxRead,
} from '../services/notificationInbox';

export default function NotificationsScreen({ navigation }) {
  const { theme } = useTheme();
  const [items, setItems] = useState([]);

  const loadInbox = useCallback(async () => {
    const inbox = await getNotificationInbox();
    setItems(inbox);
    await markNotificationInboxRead();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadInbox().catch(() => null);
    }, [loadInbox]),
  );

  const clearAll = async () => {
    await clearNotificationInbox();
    setItems([]);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[styles.backButton, { borderColor: theme.colors.border }]}
          >
            <MaterialIcons name="arrow-back" size={20} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Notifications</Text>
        </View>
        <TouchableOpacity onPress={clearAll}>
          <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>Clear all</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ListEmptyComponent={
          <EmptyState
            icon="notifications-none"
            title="No notifications yet"
            subtitle="Incoming push notifications will appear here."
            style={{ marginTop: 40 }}
          />
        }
        renderItem={({ item }) => (
          <Card style={[styles.card, { borderColor: theme.colors.border }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>
              {item.title}
            </Text>
            {item.body ? <Subtle style={{ marginTop: 4 }}>{item.body}</Subtle> : null}
            <Subtle style={{ marginTop: 8 }}>
              {new Date(item.receivedAt).toLocaleString()}
            </Subtle>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  card: {
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
});

