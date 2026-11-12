import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { applyTheme, getThemePref } from './lib/theme';
import { Landing } from './pages/Landing';
import { AppShell } from './pages/AppShell';
import { Activity, Inspections, Payments, Rentals, Settings } from './pages/pages';
import { Overview } from './pages/Overview';
import { Ambient } from './components/Ambient';
import { RentalDetail } from './pages/RentalDetail';

applyTheme(getThemePref());

// Installable app: register the service worker (it never caches /api).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}

const TITLES: Record<string, string> = {
  '/app': 'Overview',
  '/app/rentals': 'Rentals',
  '/app/inspections': 'Inspections',
  '/app/payments': 'Payments',
  '/app/activity': 'Activity',
  '/app/settings': 'Settings',
};

function App() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const on = () => {
      setPath(window.location.pathname);
      window.scrollTo(0, 0);
    };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);

  // PayPal return/cancel URLs point at /r/:id; keep them working.
  const legacy = path.match(/^\/r\/([\w-]+)/);
  useEffect(() => {
    if (legacy) window.history.replaceState({}, '', `/app/rentals/${legacy[1]}${window.location.search}`);
  }, [legacy]);

  useEffect(() => {
    if (path.startsWith('/app')) document.title = `${TITLES[path] ?? 'Rental'} · Handback`;
  }, [path]);

  if (!path.startsWith('/app') && !legacy)
    return (
      <>
        <Ambient />
        <Landing />
      </>
    );

  const rental = path.match(/^\/app\/rentals\/([\w-]+)/)?.[1] ?? legacy?.[1];
  let page;
  if (rental) page = <RentalDetail key={rental} id={rental} />;
  else if (path.startsWith('/app/rentals')) page = <Rentals />;
  else if (path.startsWith('/app/inspections')) page = <Inspections />;
  else if (path.startsWith('/app/payments')) page = <Payments />;
  else if (path.startsWith('/app/activity')) page = <Activity />;
  else if (path.startsWith('/app/settings')) page = <Settings />;
  else page = <Overview />;

  return (
    <>
      <Ambient />
      <AppShell path={legacy ? `/app/rentals/${legacy[1]}` : path}>{page}</AppShell>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
