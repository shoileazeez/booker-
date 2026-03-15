import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { MaterialIcons } from '@expo/vector-icons';

export const Card = ({ children, style }) => {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          shadowColor: '#0f172a',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

export const Title = ({ children }) => {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  return <Text style={[styles.title, { color: theme.colors.textPrimary }]}>{children}</Text>;
};

export const Subtle = ({ children }) => {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  return <Text style={[styles.subtle, { color: theme.colors.textSecondary }]}>{children}</Text>;
};

export const AppButton = ({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  style,
  textStyle,
}) => {
  const themeContext = useTheme();
  const theme = themeContext.theme;

  const variantStyles = {
    primary: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary, textColor: '#fff' },
    secondary: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, textColor: theme.colors.textPrimary },
    destructive: { backgroundColor: theme.colors.error, borderColor: theme.colors.error, textColor: '#fff' },
    ghost: { backgroundColor: 'transparent', borderColor: theme.colors.border, textColor: theme.colors.textPrimary },
  };

  const selected = variantStyles[variant] || variantStyles.primary;
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.button,
        { backgroundColor: selected.backgroundColor, borderColor: selected.borderColor, opacity: isDisabled ? 0.65 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={selected.textColor} />
      ) : (
        <>
          {icon ? <MaterialIcons name={icon} size={18} color={selected.textColor} style={{ marginRight: 8 }} /> : null}
          <Text style={[styles.buttonText, { color: selected.textColor }, textStyle]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

export const EmptyState = ({ icon = 'inbox', title, subtitle, style }) => {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  return (
    <View style={[styles.emptyWrap, style]}>
      <View style={[styles.emptyIconWrap, { backgroundColor: `${theme.colors.primary}15` }]}>
        <MaterialIcons name={icon} size={26} color={theme.colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.colors.textPrimary }]}>{title}</Text>
      {subtitle ? <Text style={[styles.emptySubtitle, { color: theme.colors.textSecondary }]}>{subtitle}</Text> : null}
    </View>
  );
};

export const SkeletonBlock = ({ height = 14, width = '100%', style }) => {
  const themeContext = useTheme();
  const theme = themeContext.theme;
  return <View style={[styles.skeleton, { height, width, backgroundColor: theme.colors.border }, style]} />;
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginVertical: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  title: { fontSize: 16, fontWeight: '600' },
  subtle: { fontSize: 13 },
  button: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  emptyWrap: {
    paddingVertical: 24,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  skeleton: {
    borderRadius: 8,
    marginBottom: 8,
  },
});

export default { Card, Title, Subtle, AppButton, EmptyState, SkeletonBlock };
