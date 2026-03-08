import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { api } from '../api/client';
import { cacheInventory, getCachedInventory } from '../storage/offlineStore';
import { Card, Subtle } from '../components/UI';
import { MaterialIcons } from '@expo/vector-icons';

export default function SalesScreen({ navigation }) {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  const workspace = useWorkspace();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);

  useEffect(() => {
    const loadItems = async () => {
      if (!workspace.currentWorkspaceId) return;
      setLoading(true);
      try {
        const data = await api.get(`/workspaces/${workspace.currentWorkspaceId}/inventory`);
        const list = Array.isArray(data) ? data : [];
        setItems(list);
        cacheInventory(workspace.currentWorkspaceId, list);
      } catch (err) {
        const cached = await getCachedInventory(workspace.currentWorkspaceId);
        if (cached && cached.length) {
          setItems(cached);
        }
      } finally {
        setLoading(false);
      }
    };
    loadItems();
  }, [workspace.currentWorkspaceId]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => {
      const text = `${item.name} ${item.category} ${item.location}`.toLowerCase();
      return text.includes(term);
    });
  }, [items, search]);

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === item.id);
      if (existing) {
        return prev.map((c) => (c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId) => {
    setCart((prev) => prev.filter((c) => c.id !== itemId));
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity * (item.sellingPrice || 0), 0);
  }, [cart]);

  const handleCompleteSale = () => {
    navigation.navigate('RecordSale', { cart });
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}> 
      <View style={styles.searchContainer}> 
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search items..."
          placeholderTextColor={theme.colors.textSecondary}
          style={[styles.searchInput, { backgroundColor: theme.colors.card, color: theme.colors.textPrimary, borderColor: theme.colors.border }]}
        />
        <MaterialIcons name="search" size={20} color={theme.colors.textSecondary} style={styles.searchIcon} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.colors.primary} />
      ) : (
        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Subtle>No items found</Subtle>
            </View>
          }
          renderItem={({ item }) => {
            const inCart = cart.find((c) => c.id === item.id);
            return (
              <Card style={styles.itemCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.colors.textPrimary, fontWeight: '700', fontSize: 16 }}>{item.name}</Text>
                    <Subtle>{item.category || 'Uncategorized'}</Subtle>
                    <Text style={{ color: theme.colors.textSecondary, marginTop: 4 }}>In stock: {item.quantity}</Text>
                  </View>
                  <TouchableOpacity onPress={() => addToCart(item)} style={[styles.addButton, { backgroundColor: theme.colors.primary }]}> 
                    <MaterialIcons name="add" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
                {inCart ? (
                  <View style={styles.cartTag}>
                    <Text style={{ color: '#fff', fontSize: 12 }}>In cart: {inCart.quantity}</Text>
                  </View>
                ) : null}
              </Card>
            );
          }}
        />
      )}

      {cart.length > 0 && (
        <View style={[styles.cartFooter, { backgroundColor: theme.colors.card }]}> 
          <View>
            <Text style={{ color: theme.colors.textPrimary, fontWeight: '700' }}>{cart.length} item(s)</Text>
            <Text style={{ color: theme.colors.textSecondary }}>Total: ${cartTotal.toFixed(2)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => setCart([])} style={[styles.cartAction, { backgroundColor: theme.colors.border }]}> 
              <Text style={{ color: theme.colors.textPrimary }}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCompleteSale} style={[styles.cartAction, { backgroundColor: theme.colors.primary, marginLeft: 10 }]}> 
              <Text style={{ color: '#fff' }}>Complete Sale</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchContainer: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center'
  },
  searchInput: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingLeft: 40
  },
  searchIcon: {
    position: 'absolute',
    left: 28
  },
  itemCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 14
  },
  addButton: {
    padding: 10,
    borderRadius: 10
  },
  cartFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderColor: '#E1E1E1',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  cartAction: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10
  },
  cartTag: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10
  }
});
