import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconActivity, IconCard, IconLogo, IconOverview, IconRentals, IconScan, IconSettings, IconX } from '../components/icons';
import { ThemeToggle } from '../components/ThemeToggle';
import { Alert, Link } from '../components/ui';
import { isDemoMode, setDemoMode } from '../api';
import { DataProvider, useData } from '../lib/data';
import { needsInspection } from '../lib/derive';

const NAV = [
  { to: '/app', label: 'Overview', icon: <IconOverview />, exact: true },
  { to: '/app/rentals', label: 'Rentals', icon: <IconRentals /> },
  { to: '/app/inspections', label: 'Inspections', icon: <IconScan />, badge: true },
  { to: '/app/payments', label: 'Payments', icon: <IconCard /> },
  { to: '/app/activity', label: 'Activity', icon: <IconActivity /> },
  { to: '/app/settings', label: 'Settings', icon: <IconSettings /> },
];

const isActive = (path: string, n: (typeof NAV)[number]) => (n.exact ? path === n.to : path.startsWith(n.to));

/** Floating navigation: a round button at the bottom right opens a frosted panel. Escape or a click outside closes it. */
function NavDock({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const { rentals, config } = useData();
  const pending = rentals.filter(needsInspection).length;
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('[aria-current="page"], a')?.focus());
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const current = NAV.find((n) => isActive(path, n));

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            className="dock-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {open && (
          <motion.nav
            ref={panel}
            id="dock-panel"
            className="dock-panel glass"
            aria-label="App"
            initial={{ opacity: 0, scale: 0.6, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.7, y: 16 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            style={{ transformOrigin: 'bottom right' }}
          >
            <div className="dock-head">
              <span className="dock-shop-mark" aria-hidden="true">
                LR
              </span>
              <div>
                <div className="dock-shop">Lensworks Rentals</div>
                <div className="dock-sub">Demo shop · PayPal sandbox</div>
              </div>
            </div>
            <ul className="dock-list">
              {NAV.map((n, i) => {
                const active = isActive(path, n);
                return (
                  <motion.li key={n.to} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.03 * i + 0.05 }}>
                    <Link to={n.to} className={`dock-link ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined}>
                      <span className="dock-icon">{n.icon}</span>
                      <span>{n.label}</span>
                      {n.badge && pending > 0 && <span className="dock-count">{pending}</span>}
                    </Link>
                  </motion.li>
                );
              })}
            </ul>
            <div className="dock-foot">
              <span className={`dock-dot ${config?.features.paypal && config?.features.ai ? 'ok' : ''}`} aria-hidden="true" />
              {config ? `${config.features.paypal ? 'PayPal' : 'PayPal missing'} · ${config.features.ai ? 'Gemini' : 'Gemini missing'}` : 'Checking…'}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
      <motion.button
        ref={button}
        className="dock-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="dock-panel"
        aria-label={open ? 'Close navigation' : `Open navigation${current ? `, current page ${current.label}` : ''}`}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={open ? 'x' : 'grid'} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }} className="dock-btn-icon">
            {open ? <IconX size={22} /> : <IconOverview size={22} />}
          </motion.span>
        </AnimatePresence>
        {!open && pending > 0 && <span className="dock-btn-badge">{pending}</span>}
      </motion.button>
    </>
  );
}

/** Phone-only bottom tab bar (Apple HIG: five tabs max; Settings sits in the top bar). */
function TabBar({ path }: { path: string }) {
  const { rentals } = useData();
  const pending = rentals.filter(needsInspection).length;
  const tabs = [
    { to: '/app', label: 'Home', icon: <IconOverview />, exact: true },
    { to: '/app/rentals', label: 'Rentals', icon: <IconRentals /> },
    { to: '/app/inspections', label: 'Inspect', icon: <IconScan />, badge: pending },
    { to: '/app/payments', label: 'Payments', icon: <IconCard /> },
    { to: '/app/activity', label: 'Activity', icon: <IconActivity /> },
  ];
  return (
    <nav className="tabbar" aria-label="App tabs">
      {tabs.map((t) => {
        const active = t.exact ? path === t.to : path.startsWith(t.to);
        return (
          <Link key={t.to} to={t.to} className={`tab ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined}>
            {t.icon}
            <span>{t.label}</span>
            {t.badge ? <span className="tab-badge">{t.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function Shell({ path, children }: { path: string; children: ReactNode }) {
  const { error, config } = useData();
  const current = NAV.find((n) => isActive(path, n));
  return (
    <div className="app">
      <a href="#app-main" className="skip">
        Skip to content
      </a>
      <header className="topbar glass-bar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <IconLogo size={24} /> <span>Handback</span>
          </Link>
          <span className="topbar-sep" aria-hidden="true">
            /
          </span>
          <span className="topbar-page">{path.startsWith('/app/rentals/') ? 'Rental' : current?.label ?? 'Overview'}</span>
          <div className="topbar-right">
            <span className="sandbox-pill">Sandbox</span>
            <ThemeToggle />
            <Link to="/app/settings" className="icon-btn topbar-settings" aria-current={path === '/app/settings' ? 'page' : undefined}>
              <IconSettings />
              <span className="sr-only">Settings</span>
            </Link>
          </div>
        </div>
      </header>
      <main id="app-main" className="content">
        {error && <Alert tone="bad">{error}</Alert>}
        {config?.demo && (
          <Alert tone="info">
            <strong>Demo mode.</strong> Sample rentals with simulated PayPal and simulated AI; nothing here calls PayPal or Gemini.{' '}
            {isDemoMode() ? (
              <button className="btn-link" onClick={() => setDemoMode(false)}>
                Exit demo
              </button>
            ) : (
              <>
                Run <code>npm run dev</code> for the real integrations.
              </>
            )}
          </Alert>
        )}
        {config && !config.demo && (!config.features.paypal || !config.features.ai) && (
          <Alert tone="warn">
            Setup needed: {[!config.features.paypal && 'PayPal sandbox keys', !config.features.ai && 'Gemini key'].filter(Boolean).join(' and ')} missing in <code>.env</code>. Restart{' '}
            <code>npm run dev</code> after adding them, or{' '}
            <button className="btn-link" onClick={() => setDemoMode(true)}>
              try the demo
            </button>
            .
          </Alert>
        )}
        {children}
      </main>
      <NavDock path={path} />
      <TabBar path={path} />
    </div>
  );
}

export function AppShell({ path, children }: { path: string; children: ReactNode }) {
  return (
    <DataProvider>
      <Shell path={path}>{children}</Shell>
    </DataProvider>
  );
}
