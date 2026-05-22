import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DashboardOutlined,
  DeploymentUnitOutlined,
  LogoutOutlined,
  MoonOutlined,
  SunOutlined,
  TeamOutlined,
  EnvironmentOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Layout, Menu, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef } from 'react';
import { logout } from '@/api/auth';
import { triggerAutoBackup } from '@/api/backup';
import { getSettings } from '@/api/settings';
import { setAMapConfig } from '@/lib/amap';
import { toast } from '@/lib/message';
import { useThemeMode } from '@/lib/theme';

const { Header, Content } = Layout;

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: '总览', icon: <DashboardOutlined /> },
  { to: '/persons', label: '人物', icon: <TeamOutlined /> },
  { to: '/map', label: '地图', icon: <EnvironmentOutlined /> },
  { to: '/settings', label: '设置', icon: <SettingOutlined /> },
];

function currentNavKey(pathname: string): string {
  return NAV.find((it) => pathname.startsWith(it.to))?.to ?? '/persons';
}

function currentNavLabel(pathname: string, fallback: string): string {
  return NAV.find((it) => pathname.startsWith(it.to))?.label ?? fallback;
}

export default function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, setMode } = useThemeMode();
  const qc = useQueryClient();

  const settingsQ = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  useEffect(() => {
    if (settingsQ.data) {
      setAMapConfig(settingsQ.data.amap_key, settingsQ.data.amap_security_code);
    }
  }, [settingsQ.data]);

  // 机会式自动备份：会话内仅发一次；24h 冷却 + S3 必须已配置
  const autoBackupFiredRef = useRef(false);
  useEffect(() => {
    if (autoBackupFiredRef.current) return;
    const s = settingsQ.data;
    if (!s) return;
    if (!s.auto_backup_enabled) return;
    const s3Ok = !!(
      s.s3_backup_endpoint &&
      s.s3_backup_bucket &&
      s.s3_backup_access_key_id &&
      s.s3_backup_secret_access_key
    );
    if (!s3Ok) return;
    const last = s.last_auto_backup_at ?? 0;
    if (last && Date.now() / 1000 - last < 24 * 3600) return;

    autoBackupFiredRef.current = true; // StrictMode 双挂载去重
    void triggerAutoBackup({ force: false })
      .then((r) => {
        if (!r.skipped) void qc.invalidateQueries({ queryKey: ['settings'] });
      })
      .catch((e) => {

        console.warn('[auto-backup]', e);
      });
  }, [settingsQ.data, qc]);

  const logoutMut = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      toast.success('已退出登录');
      navigate('/login');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeKey = currentNavKey(location.pathname);
  const appTitle = settingsQ.data?.app_title?.trim() || '人物关系网';
  const pageTitle = currentNavLabel(location.pathname, appTitle);

  useEffect(() => {
    document.title = pageTitle === appTitle ? appTitle : `${pageTitle} · ${appTitle}`;
  }, [pageTitle, appTitle]);

  const cycleTheme = () => {
    setMode(mode === 'light' ? 'dark' : 'light');
  };
  const themeIcon = mode === 'dark' ? <MoonOutlined /> : <SunOutlined />;

  const menuItems: MenuProps['items'] = useMemo(
    () =>
      NAV.map((it) => ({
        key: it.to,
        label: <Link to={it.to}>{it.label}</Link>,
        icon: it.icon,
      })),
    []
  );

  const accountMenu: MenuProps['items'] = [
    {
      key: 'logout',
      danger: true,
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: () => logoutMut.mutate(),
    },
  ];

  return (
    <Layout className="min-h-dvh bg-[var(--color-background)]">
      {/* ───── 桌面顶栏 (md+) ───── */}
      <Header
        className="sticky top-0 z-30 hidden border-b border-[var(--color-border)] md:flex"
        style={{
          background: 'color-mix(in srgb, var(--color-background) 92%, transparent)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <div className="mx-auto flex h-[60px] w-full max-w-7xl items-center gap-6">
          <Link
            to="/persons"
            className="flex items-center gap-2 no-underline"
            style={{ lineHeight: 'normal', color: 'var(--color-foreground)' }}
          >
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[16px]"
              style={{
                background: 'var(--color-accent-soft)',
                color: 'var(--color-accent-strong)',
              }}
              aria-hidden
            >
              <DeploymentUnitOutlined />
            </span>
            <span className="text-[17px] font-semibold tracking-tight leading-none">
              {appTitle}
            </span>
          </Link>

          <Menu
            mode="horizontal"
            selectedKeys={[activeKey]}
            items={menuItems}
            className="flex-1 border-0"
            style={{
              background: 'transparent',
              lineHeight: '60px',
              minWidth: 0,
            }}
            disabledOverflow
          />

          <Tooltip title={mode === 'light' ? '切换到深色' : '切换到浅色'}>
            <Button type="text" size="middle" onClick={cycleTheme} aria-label="切换主题">
              {themeIcon}
            </Button>
          </Tooltip>

          <Dropdown menu={{ items: accountMenu }} trigger={['click']} placement="bottomRight">
            <Button type="text" size="middle">
              账户
            </Button>
          </Dropdown>
        </div>
      </Header>

      {/* ───── 移动顶栏 (xs/sm) ───── */}
      <Header
        className="sticky top-0 z-30 flex items-center border-b border-[var(--color-border)] md:hidden"
        style={{
          background: 'color-mix(in srgb, var(--color-background) 92%, transparent)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          padding: '0 20px',
          height: 52,
          lineHeight: '52px',
        }}
      >
        <span
          className="mr-2 grid h-7 w-7 shrink-0 place-items-center rounded-md text-[14px]"
          style={{
            background: 'var(--color-accent-soft)',
            color: 'var(--color-accent-strong)',
            lineHeight: 'normal',
          }}
          aria-hidden
        >
          <DeploymentUnitOutlined />
        </span>
        <span className="text-[16px] font-semibold tracking-tight" style={{ lineHeight: 'normal' }}>
          {pageTitle}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="text"
            size="small"
            onClick={cycleTheme}
            aria-label="切换主题"
          >
            {themeIcon}
          </Button>
          <Tooltip title="退出登录">
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={() => logoutMut.mutate()}
              aria-label="退出登录"
            />
          </Tooltip>
        </div>
      </Header>

      {/* ───── 主内容 ───── */}
      <Content
        className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 md:px-6 md:py-7"
        style={{
          paddingBottom: 'calc(4.5rem + env(safe-area-inset-bottom))',
        }}
      >
        <Outlet />
      </Content>

      {/* ───── 移动底栏 (xs/sm) ───── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-[var(--color-border)] md:hidden"
        style={{
          height: 'calc(4rem + env(safe-area-inset-bottom))',
          paddingBottom: 'env(safe-area-inset-bottom)',
          background: 'color-mix(in srgb, var(--color-background) 95%, transparent)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
        aria-label="主导航"
      >
        {NAV.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={false}
            className={({ isActive }) =>
              [
                'flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors no-underline relative',
                isActive
                  ? 'text-[var(--color-accent)]'
                  : 'text-[var(--color-muted-fg)]',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <span style={{ fontSize: 20, lineHeight: 1 }} aria-hidden>
                  {it.icon}
                </span>
                <span>{it.label}</span>
                {isActive && (
                  <span
                    className="absolute bottom-1 left-1/2 -translate-x-1/2 h-[2px] w-5 rounded-full"
                    style={{ background: 'var(--color-accent)' }}
                  />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </Layout>
  );
}
