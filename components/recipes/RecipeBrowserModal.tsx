import { useState, useRef } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
            <Text style={styles.cancelBtn}>Cancel</Text>
          </TouchableOpacity>

          <View style={styles.urlBar}>
            {loading && <ActivityIndicator size="small" color="#9CA3AF" style={{ marginRight: 6 }} />}
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
              <ActivityIndicator size="large" color="#3B7A57" />
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
  container: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 10,
  },
  cancelBtn: { fontSize: 16, color: '#6B7280', fontWeight: '500', minWidth: 52 },
  backBtn: { fontSize: 16, color: '#3B7A57', fontWeight: '600', minWidth: 52, textAlign: 'right' },
  backBtnDisabled: { color: '#D1D5DB' },

  urlBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  urlBarText: { flex: 1, fontSize: 13, color: '#374151' },

  webView: { flex: 1 },
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF',
  },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  useUrlBtn: {
    backgroundColor: '#3B7A57',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  useUrlBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
