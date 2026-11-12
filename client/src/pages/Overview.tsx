import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { api, holdOf, usd, type Rental, type RentalEvent } from '../api';
import { IconArrowRight } from '../components/icons';
import { Link, Mono } from '../components/ui';
import { NumberTicker, usdFmt } from '../components/fx';
import { useData } from '../lib/data';
import { computeStats, fmtDate, needsInspection, paymentRows } from '../lib/derive';
import { CreateRentalButton, Timeline } from './pages';

/** The handback runs left to right. Each rental sits in exactly one lane. */
const LANES: { key: string; title: string; hint: string; statuses: string[] }[] = [
  { key: 'deposit', title: 'Awaiting deposit', hint: 'Renter approves the PayPal hold', statuses: ['booked', 'hold_pending'] },
  { key: 'pickup', title: 'Ready for pick-up', hint: 'Shoot the baseline photos', statuses: ['held'] },
  { key: 'out', title: 'Out with renter', hint: 'Waiting for the return', statuses: ['out'] },
  { key: 'review', title: 'Needs review', hint: 'Approve or adjust findings', statuses: ['returned', 'settling', 'attention'] },
  { key: 'settled', title: 'Closed', hint: 'Settled or cancelled', statuses: ['settled_captured', 'settled_void', 'cancelled'] },
];

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 5 ? 'Working late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function shopName() {
  try {
    return localStorage.getItem('handback-shop-name') || 'Lensworks Rentals';
  } catch {
    return 'Lensworks Rentals';
  }
}

function MoneyFlow({ rentals }: { rentals: Rental[] }) {
  const s = computeStats(rentals);
  const rows = paymentRows(rentals);
  const released = rows.filter((r) => r.kind === 'release').reduce((a, r) => a + r.amountCents, 0);
  const parts = [
    { key: 'held', label: 'On hold', cents: s.heldCents, cls: 'seg-held', note: `${s.heldCount} authorization${s.heldCount === 1 ? '' : 's'}, not charged` },
    { key: 'fees', label: 'Rental fees', cents: s.feesCents, cls: 'seg-fees', note: 'Earned for lending' },
    { key: 'kept', label: 'Damage', cents: s.damageCents, cls: 'seg-kept', note: 'New damage only' },
    { key: 'released', label: 'Released', cents: released, cls: 'seg-released', note: 'Returned to renters' },
    { key: 'refunded', label: 'Refunded', cents: s.refundedCents, cls: 'seg-refunded', note: 'Upheld appeals' },
  ];
  const total = parts.reduce((a, p) => a + p.cents, 0);
  return (
    <section className="flow card pad" aria-labelledby="flow-h">
      <div className="flow-top">
        <div>
          <h2 id="flow-h" className="eyebrow-h">
            Money on PayPal
          </h2>
          <div className="flow-big">
            <NumberTicker value={s.heldCents} format={usdFmt} />
            <span> on hold right now</span>
          </div>
        </div>
        <Link to="/app/payments" className="link-sm">
          Ledger <IconArrowRight size={14} />
        </Link>
      </div>
      <div className="flow-bar" role="img" aria-label={parts.map((p) => `${p.label} ${usd(p.cents)}`).join(', ')}>
        {total === 0 ? (
          <span className="flow-empty">No money has moved yet</span>
        ) : (
          parts
            .filter((p) => p.cents > 0)
            .map((p, i) => (
              <motion.span
                key={p.key}
                className={`flow-seg ${p.cls}`}
                initial={{ flexGrow: 0 }}
                animate={{ flexGrow: p.cents }}
                transition={{ duration: 0.9, delay: 0.1 * i, ease: [0.2, 0.8, 0.2, 1] }}
                title={`${p.label}: ${usd(p.cents)}`}
              />
            ))
        )}
      </div>
      <ul className="flow-legend">
        {parts.map((p) => (
          <li key={p.key}>
            <span className={`flow-dot ${p.cls}`} aria-hidden="true" />
            <div>
              <strong>{usd(p.cents)}</strong>
              <span>{p.label}</span>
              <small>{p.note}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LaneCard({ r }: { r: Rental }) {
  const { itemName } = useData();
  const late = r.status === 'out' && Date.parse(r.endsAt) < Date.now();
  return (
    <motion.li layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Link to={`/app/rentals/${r.id}`} className="ticket">
        <span className="ticket-item">{itemName(r.itemId)}</span>
        <span className="ticket-who">{r.renterName}</span>
        <span className="ticket-foot">
          <span className="ticket-amt">{r.status === 'settled_captured' ? `${usd(r.capturedCents ?? 0)} paid` : r.status === 'cancelled' ? 'Cancelled' : usd(holdOf(r))}</span>
          <span className={`ticket-date ${late ? 'is-late' : ''}`}>{late ? `Due ${fmtDate(r.endsAt)}` : r.status === 'out' ? `Back ${fmtDate(r.endsAt)}` : fmtDate(r.startsAt)}</span>
        </span>
      </Link>
    </motion.li>
  );
}

function Board({ rentals }: { rentals: Rental[] }) {
  return (
    <section className="board" aria-label="Rentals by stage">
      {LANES.map((lane, i) => {
        const items = rentals.filter((r) => lane.statuses.includes(r.status));
        return (
          <div key={lane.key} className={`lane lane-${lane.key}`}>
            <header className="lane-head">
              <span className="lane-step">{i + 1}</span>
              <div>
                <h3>{lane.title}</h3>
                <p>{lane.hint}</p>
              </div>
              <span className="lane-count">{items.length}</span>
            </header>
            {items.length ? (
              <ul className="lane-list">
                {items.slice(0, 6).map((r) => (
                  <LaneCard key={r.id} r={r} />
                ))}
                {items.length > 6 && (
                  <li>
                    <Link to="/app/rentals" className="lane-more">
                      +{items.length - 6} more
                    </Link>
                  </li>
                )}
              </ul>
            ) : (
              <div className="lane-empty">Nothing here</div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function FirstRun() {
  const steps = [
    ['Create a rental', 'Pick an item and dates. Fee and deposit come from the item.'],
    ['Renter approves the hold', 'Fee + deposit, as a PayPal authorization. Nothing is charged.'],
    ['Shoot pick-up photos', 'Gemini records every existing mark; the renter signs off.'],
    ['Compare at return', 'The fee plus any new damage is captured; the rest is released.'],
  ];
  return (
    <section className="firstrun card pad">
      <div>
        <h2>Run your first handback</h2>
        <p className="muted">About five minutes end to end in the PayPal sandbox.</p>
      </div>
      <ol>
        {steps.map(([t, d], i) => (
          <li key={t}>
            <span>{i + 1}</span>
            <div>
              <strong>{t}</strong>
              <small>{d}</small>
            </div>
          </li>
        ))}
      </ol>
      <CreateRentalButton />
    </section>
  );
}

export function Overview() {
  const { rentals, loading } = useData();
  const [events, setEvents] = useState<RentalEvent[] | null>(null);
  useEffect(() => {
    api.events(6).then(setEvents).catch(() => setEvents([]));
  }, [rentals]);
  const s = useMemo(() => computeStats(rentals), [rentals]);
  const attention = rentals.filter((r) => needsInspection(r) || r.status === 'returned' || r.status === 'attention').length;
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const summary = loading
    ? 'Loading your counter…'
    : rentals.length === 0
      ? 'No rentals yet. Start one and the board below fills in as it moves.'
      : `${s.active} rental${s.active === 1 ? '' : 's'} in progress, ${usd(s.heldCents)} held on PayPal, ${attention ? `${attention} waiting on you.` : 'nothing waiting on you.'}`;

  return (
    <div className="page dash">
      <header className="dash-head">
        <div>
          <p className="dash-date">{today}</p>
          <h1>
            {greeting()}, {shopName().split(' ')[0]}.
          </h1>
          <p className="dash-summary">{summary}</p>
        </div>
        <CreateRentalButton />
      </header>

      {!loading && rentals.length === 0 ? <FirstRun /> : <MoneyFlow rentals={rentals} />}

      <div className="dash-grid">
        <div className="dash-main">
          <div className="dash-sec-head">
            <h2>The counter</h2>
            <Link to="/app/rentals" className="link-sm">
              All rentals <IconArrowRight size={14} />
            </Link>
          </div>
          <Board rentals={rentals} />
        </div>
        <aside className="dash-side card pad">
          <div className="dash-sec-head">
            <h2>Latest</h2>
            <Link to="/app/activity" className="link-sm">
              All <IconArrowRight size={14} />
            </Link>
          </div>
          {events && events.length ? <Timeline events={events} compact /> : <p className="muted small">{events ? 'Events show up here as rentals move.' : 'Loading…'}</p>}
          {rentals[0] && (
            <p className="fine dash-id">
              Latest rental <Mono>{rentals[0].id}</Mono>
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
