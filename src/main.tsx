import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import { ThemeProvider, useThemeMode } from './lib/theme';
import { registerMessageInstance, registerModalInstance } from './lib/message';
// @ts-expect-error fontsource has no type declarations
import '@fontsource-variable/inter';
import './styles/globals.css';

// AMap security config is now loaded from DB settings via setAMapConfig()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

// ───────────────────────────────────────────────────────
// Notion 冷静 —— 共享 token（light/dark 通用部分）
// ───────────────────────────────────────────────────────

const sharedToken = {
  colorPrimary: '#10b981',
  colorInfo: '#10b981',
  colorSuccess: '#10b981',
  colorWarning: '#b45309',
  colorError: '#dc2626',
  borderRadius: 6,
  borderRadiusLG: 8,
  borderRadiusSM: 4,
  borderRadiusXS: 4,
  controlHeight: 30,
  controlHeightSM: 24,
  controlHeightLG: 36,
  fontFamily:
    '"Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  fontSize: 13,
  boxShadow: 'none',
  boxShadowSecondary: '0 4px 12px rgba(0,0,0,0.08)',
  boxShadowTertiary: 'none',
  motionDurationMid: '0.18s',
  motionDurationFast: '0.12s',
};

const lightToken = {
  ...sharedToken,
  colorBgBase: '#ffffff',
  colorBgLayout: '#ffffff',
  colorBgContainer: '#ffffff',
  colorBgElevated: '#ffffff',
  colorTextBase: '#0a0a0a',
  colorBorder: '#e5e7eb',
  colorBorderSecondary: '#f1f5f9',
};

const darkToken = {
  ...sharedToken,
  colorBgBase: '#0a0a0a',
  colorBgLayout: '#0a0a0a',
  colorBgContainer: '#141414',
  colorBgElevated: '#1a1a1a',
  colorTextBase: '#e5e7eb',
  colorBorder: '#2a2a2a',
  colorBorderSecondary: '#1f1f1f',
};

const sharedComponents = {
  Button: {
    primaryShadow: 'none',
    defaultShadow: 'none',
    dangerShadow: 'none',
    fontWeight: 500,
  },
  Card: {
    boxShadowTertiary: 'none',
    headerBg: 'transparent',
  },
  Layout: {
    headerHeight: 60,
    headerPadding: '0 24px',
  },
  Menu: {
    itemSelectedBg: '#ecfdf5',
    itemSelectedColor: '#059669',
    itemHoverBg: 'transparent',
    itemHoverColor: '#0a0a0a',
    horizontalItemSelectedColor: '#059669',
    horizontalItemHoverColor: '#0a0a0a',
    horizontalItemBorderRadius: 6,
    iconSize: 16,
  },
  Tag: {
    defaultBg: '#f1f5f9',
    defaultColor: '#0a0a0a',
  },
  Modal: {
    borderRadiusLG: 8,
  },
  Input: {
    activeShadow: '0 0 0 2px rgba(16, 185, 129, 0.18)',
  },
  Select: {
    optionSelectedBg: '#ecfdf5',
    optionSelectedColor: '#059669',
  },
  Segmented: {
    itemSelectedBg: '#ffffff',
    itemSelectedColor: '#059669',
    trackBg: '#f1f5f9',
  },
  Tabs: {
    itemSelectedColor: '#059669',
    itemHoverColor: '#0a0a0a',
    inkBarColor: '#10b981',
  },
  Form: {
    labelColor: '#0a0a0a',
    labelFontSize: 12,
    verticalLabelPadding: '0 0 4px',
    itemMarginBottom: 16,
  },
  Tooltip: {
    colorBgSpotlight: '#0a0a0a',
    colorTextLightSolid: '#ffffff',
  },
  Switch: {
    colorPrimary: '#10b981',
    colorPrimaryHover: '#059669',
  },
  Radio: {
    buttonSolidCheckedBg: '#10b981',
    buttonSolidCheckedHoverBg: '#059669',
  },
  Message: {
    contentBg: '#f8fafc',
    contentPadding: '8px 14px',
  },
};

const darkComponents = {
  ...sharedComponents,
  Layout: {
    ...sharedComponents.Layout,
    headerBg: '#0a0a0a',
    bodyBg: '#0a0a0a',
  },
  Menu: {
    ...sharedComponents.Menu,
    itemSelectedBg: 'rgba(16, 185, 129, 0.12)',
    itemHoverColor: '#e5e7eb',
    horizontalItemHoverColor: '#e5e7eb',
  },
  Tag: {
    defaultBg: '#1f1f1f',
    defaultColor: '#e5e7eb',
  },
  Segmented: {
    itemSelectedBg: '#1a1a1a',
    itemSelectedColor: '#10b981',
    trackBg: '#1f1f1f',
  },
  Tabs: {
    ...sharedComponents.Tabs,
    itemHoverColor: '#e5e7eb',
  },
  Form: {
    ...sharedComponents.Form,
    labelColor: '#e5e7eb',
  },
  Tooltip: {
    colorBgSpotlight: '#e5e7eb',
    colorTextLightSolid: '#0a0a0a',
  },
  Message: {
    contentBg: '#1a1a1a',
    contentPadding: '8px 14px',
  },
};

function MessageBridge() {
  const { message, modal } = AntApp.useApp();
  registerMessageInstance(message);
  registerModalInstance(modal);
  return null;
}

function ThemedApp() {
  const { resolved } = useThemeMode();
  const isDark = resolved === 'dark';

  const themeConfig = {
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    cssVar: true,
    hashed: true,
    token: isDark ? darkToken : lightToken,
    components: isDark ? darkComponents : { ...sharedComponents, Layout: { ...sharedComponents.Layout, headerBg: '#ffffff', bodyBg: '#ffffff' } },
  };

  return (
    <ConfigProvider locale={zhCN} theme={themeConfig} componentSize="small">
      <AntApp message={{ top: 56, duration: 2.4, maxCount: 3 }}>
        <MessageBridge />
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  </StrictMode>
);
