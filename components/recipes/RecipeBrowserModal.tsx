import { useState, useRef, useCallback } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Platform, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../constants/theme';

let WebView: any = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

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
  const webViewRef = useRef<any>(null);
  const [currentUrl, setCurrentUrl] = useState(buildSearchUrl(recipeName, searchSite));
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);
  const [urlInput, setUrlInput] = useState('');

  const handleNavigationStateChange = useCallback((state: any) => {
    setCurrentUrl(state.url);
    setCanGoBack(state.canGoBack);
    setLoading(state.loading);
  }, []);

  const handleUseUrl = () => {
    const url = Platform.OS === 'web' ? (urlInput.trim() || currentUrl) : currentUrl;
    onUseUrl(url);
    onClose();
  };

  let displayHost = currentUrl;
  try { displayHost = new URL(currentUrl).hostname.replace(/^www\./, ''); } catch {}

  const isWeb = Platform.OS === 'web';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top || 16 }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.closeBtn}>×</Text>
          </TouchableOpacity>

          <View style={styles.urlBar}>
            {!isWeb && loading && <ActivityIndicator size="small" color={colors.text.placeholder} style={{ marginRight: 6 }} />}
            <Text style={styles.urlBarText} numberOfLines={1}>{displayHost}</Text>
          </View>

          {!isWeb && (
            <TouchableOpacity
              onPress={() => canGoBack && webViewRef.current?.goBack()}
              disabled={!canGoBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={[styles.backBtn, !canGoBack && styles.backBtnDisabled]}>‹ Back</Text>
            </TouchableOpacity>
          )}
        </View>

        {isWeb ? (
          /* Web: open search in new tab, paste URL back */
          <View style={styles.webFallback}>
            <Text style={styles.webFallbackTitle}>Find your recipe</Text>
            <Text style={styles.webFallbackDesc}>
              Tap the button below to search for "{recipeName}" in a new tab. When you find the recipe, copy the URL and paste it here.
            </Text>
            <TouchableOpacity
              style={styles.openSearchBtn}
              onPress={() => {
                const url = buildSearchUrl(recipeName, searchSite);
                if (typeof window !== 'undefined') window.open(url, '_blank');
              }}
            >
              <Text style={styles.openSearchBtnText}>Search for recipe →</Text>
            </TouchableOpacity>
            <Text style={styles.webFallbackLabel}>Paste the recipe URL here:</Text>
            <TextInput
              style={styles.urlInput}
              value={urlInput}
              onChangeText={setUrlInput}
              placeholder="https://..."
              placeholderTextColor={colors.text.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
        ) : (
          WebView && (
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
          )
        )}

        {/* Use this URL bar */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[styles.useUrlBtn, isWeb && !urlInput.trim() && styles.useUrlBtnDisabled]}
            onPress={handleUseUrl}
            disabled={isWeb && !urlInput.trim()}
          >
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

  webFallback: { flex: 1, padding: 24, gap: 16 },
  webFallbackTitle: { fontSize: 18, fontWeight: '700', color: colors.text.primary },
  webFallbackDesc: { fontSize: 15, color: colors.text.muted, lineHeight: 22 },
  openSearchBtn: {
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.default,
    paddingVertical: 14,
    alignItems: 'center',
  },
  openSearchBtnText: { fontSize: 15, fontWeight: '600', color: colors.brand.primary },
  webFallbackLabel: { fontSize: 13, fontWeight: '600', color: colors.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  urlInput: {
    backgroundColor: colors.background.elevated,
    borderWidth: 1,
    borderColor: colors.border.default,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text.primary,
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
  useUrlBtnDisabled: { opacity: 0.4 },
  useUrlBtnText: { color: colors.text.inverse, fontSize: 16, fontWeight: '700' },
});
