import { useState, useRef } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../constants/theme';

interface Props {
  recipeName: string;
  visible: boolean;
  searchSite?: string;
  onUseUrl: (url: string) => void;
  onClose: () => void;
}

function buildSearchUrl(recipeName: string, site: string = 'recipetineats.com') {
  const domain = site.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `https://www.google.com/search?q=${encodeURIComponent(domain + ' ' + recipeName)}`;
}

export default function RecipeBrowserModal({ recipeName, visible, searchSite, onUseUrl, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const [currentUrl, setCurrentUrl] = useState(buildSearchUrl(recipeName, searchSite));
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);

  const handleNavigationStateChange = (state: WebViewNavigation) => {
    setCurrentUrl(state.url);
    setCanGoBack(state.canGoBack);
    setLoading(state.loading);
  };

  const handleUseUrl = () => {
    onUseUrl(currentUrl);
    onClose();
  };

  // Hostname for display in the bar
  let displayHost = currentUrl;
  try { displayHost = new URL(currentUrl).hostname.replace(/^www\./, ''); } catch {}

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.closeBtn}>×</Text>
          </TouchableOpacity>

          <View style={styles.urlBar}>
            {loading && <ActivityIndicator size="small" color={colors.text.placeholder} style={{ marginRight: 6 }} />}
            <Text style={styles.urlBarText} numberOfLines={1}>{displayHost}</Text>
          </View>

          <TouchableOpacity
            onPress={() => canGoBack && webViewRef.current?.goBack()}
            disabled={!canGoBack}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={[styles.backBtn, !canGoBack && styles.backBtnDisabled]}>‹ Back</Text>
          </TouchableOpacity>
        </View>

        {/* WebView */}
        <WebView
          ref={webViewRef}
          source={{ uri: buildSearchUrl(recipeName, searchSite) }}
          onNavigationStateChange={handleNavigationStateChange}
          style={styles.webView}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.brand.primary} />
            </View>
          )}
        />

        {/* Use this URL bar */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity style={styles.useUrlBtn} onPress={handleUseUrl}>
            <Text style={styles.useUrlBtnText}>Use this URL →</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.app },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.hairline,
    gap: 10,
  },
  closeBtn: { fontSize: 28, color: colors.text.muted, fontWeight: '300', lineHeight: 28, minWidth: 28 },
  backBtn: { fontSize: 16, color: colors.brand.primary, fontWeight: '600', minWidth: 52, textAlign: 'right' },
  backBtnDisabled: { color: colors.border.default },

  urlBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.elevated,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  urlBarText: { flex: 1, fontSize: 13, color: colors.text.secondary },

  webView: { flex: 1 },
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.surface,
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border.hairline,
    backgroundColor: colors.background.app,
  },
  useUrlBtn: {
    backgroundColor: colors.brand.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  useUrlBtnText: { color: colors.text.inverse, fontSize: 16, fontWeight: '700' },
});
