import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, holdOf, usd, type Item, type Rental, type RentalEvent, apiBase, isDemoMode, setDemoMode } from '../api';
import { IconActivity, IconArrowRight, IconCard, IconPlus, IconRentals, IconScan, IconSearch } from '../components/icons';
import { Alert, Badge, Dialog, Empty, Link, Mono, PageHeader, Skeleton } from '../components/ui';
import { useData } from '../lib/data';
import {
  computeStats,
  durationDays,
  eventDetail,
  eventGroup,
  eventLabel,
  FILTERS,
  fmtDate,
  fmtDateTime,
  inspectionStage,
  isActive,
  matchesQuery,
  needsInspection,
  paymentRows,
  statusInfo,
  type FilterKey,
  type PaymentKind,
} from '../lib/derive';
import { NumberTicker, SegPill, usdFmt } from '../components/fx';
import { getThemePref, setThemePref, type ThemePref } from '../lib/theme';
import { navigate } from '../router';

/* ---------- Create rental ---------- */

const isoLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function CreateRentalButton({ variant = 'primary' }: { variant?: 'primary' | 'ghost' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={`btn btn-${variant}`} onClick={() => setOpen(true)}>
        <IconPlus size={16} /> New rental
      </button>
      <Dialog open={open} title="New rental" onClose={() => setOpen(false)}>
        <CreateRentalForm onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

function groupItems(items: Item[]): [string, Item[]][] {
  const m = new Map<string, Item[]>();
  for (const i of items) m.set(i.category ?? 'Other', [...(m.get(i.category ?? 'Other') ?? []), i]);
  return [...m.entries()];
}

/** Rentals that can be removed without stranding money (a live hold is voided first). */
export const DELETABLE = ['booked', 'hold_pending', 'held', 'cancelled', 'settled_void', 'settled_captured'];

/** Confirm + delete one or more rentals. Shared by the Rentals table and the rental page. */
export function DeleteRentalsDialog({ ids, open, onClose, onDeleted }: { ids: string[]; open: boolean; onClose: () => void; onDeleted: () => void }) {
  const { rentals, refresh } = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chosen = rentals.filter((r) => ids.includes(r.id));
  const withHold = chosen.filter((r) => r.status === 'held');
  const settled = chosen.filter((r) => r.status.startsWith('settled'));
  async function go() {
    setBusy(true);
    setError('');
    const failed: string[] = [];
    for (const r of chosen) {
      try {
        await api.remove(r.id);
      } catch (e) {
        failed.push(`${r.renterName}: ${(e as Error).message}`);
      }
    }
    await refresh();
    setBusy(false);
    if (failed.length) setError(failed.join(' · '));
    else onDeleted();
  }
  return (
    <Dialog open={open} title={chosen.length === 1 ? 'Delete this rental?' : `Delete ${chosen.length} rentals?`} onClose={onClose}>
      <div className="stack">
        <p className="muted">This removes the rental{chosen.length === 1 ? '' : 's'} and the activity log from Handback. It can't be undone.</p>
        {withHold.length > 0 && (
          <Alert tone="info">
            {withHold.length === 1 ? 'One rental has' : `${withHold.length} rentals have`} a live PayPal hold. It is voided first, so the renter gets the full {usd(withHold.reduce((s, r) => s + holdOf(r), 0))} back.
          </Alert>
        )}
        {settled.length > 0 && <p className="fine">PayPal keeps its own records of settled payments; deleting here doesn't reverse them.</p>}
        {error && <Alert tone="bad">{error}</Alert>}
        <div className="form-actions">
          <button className="btn btn-ghost" onClick={onClose}>
            Keep
          </button>
          <button className="btn btn-danger" disabled={busy || !chosen.length} onClick={go}>
            {busy ? 'Deleting…' : chosen.length === 1 ? 'Delete rental' : `Delete ${chosen.length} rentals`}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function CreateRentalForm({ onDone }: { onDone: () => void }) {
  const { items, refresh } = useData();
  const [itemId, setItemId] = useState(items[0]?.id ?? '');
  const [renterName, setRenterName] = useState('');
  const [startsAt, setStartsAt] = useState(() => isoLocal(new Date()));
  const [endsAt, setEndsAt] = useState(() => isoLocal(new Date(Date.now() + 2 * 86_400_000)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const item = items.find((i) => i.id === itemId);
  const days = Math.max(1, Math.ceil((Date.parse(endsAt) - Date.parse(startsAt)) / 86_400_000) || 1);
  const fee = item ? days * (item.dailyRateCents ?? 0) : 0;

  const nameError = renterName.trim().length === 0 ? 'Enter the renter’s name' : '';
  const dateError = !(Date.parse(endsAt) > Date.parse(startsAt)) ? 'Return must be after pick-up' : '';
  const [touched, setTouched] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (nameError || dateError || !item || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.createRental({ itemId, renterName: renterName.trim(), startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() });
      await refresh();
      onDone();
      navigate(`/app/rentals/${r.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="form" noValidate>
      <label className="field">
        <span>Item</span>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
          {groupItems(items).map(([cat, list]) => (
            <optgroup key={cat} label={cat}>
              {list.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {usd(i.dailyRateCents)}/day
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Renter name</span>
        <input value={renterName} onChange={(e) => setRenterName(e.target.value)} placeholder="e.g. Maya Rao" autoFocus aria-invalid={touched && !!nameError} maxLength={80} />
        {touched && nameError && <small className="field-error">{nameError}</small>}
      </label>
      <div className="field-row">
        <label className="field">
          <span>Pick-up</span>
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </label>
        <label className="field">
          <span>Return</span>
          <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} aria-invalid={touched && !!dateError} />
          {touched && dateError && <small className="field-error">{dateError}</small>}
        </label>
      </div>
      {item && (
        <div className="form-summary">
          <div>
            <span className="muted small">
              Rental fee ({days} day{days === 1 ? '' : 's'} × {usd(item.dailyRateCents)})
            </span>
            <strong>{usd(fee)}</strong>
          </div>
          <div>
            <span className="muted small">Refundable deposit</span>
            <strong>{usd(item.depositCents)}</strong>
          </div>
          <div>
            <span className="muted small">PayPal hold (nothing charged yet)</span>
            <strong>{usd(fee + item.depositCents)}</strong>
          </div>
          <div>
            <span className="muted small">Photo angles</span>
            <strong className="cap">{item.angles.join(' · ')}</strong>
          </div>
        </div>
      )}
      {error && <Alert tone="bad">{error}</Alert>}
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create rental'}
        </button>
      </div>
    </form>
  );
}

/* ---------- Shared bits ---------- */

function StatusBadge({ status }: { status: string }) {
  const s = statusInfo(status);
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

function RentalRow({ r }: { r: Rental }) {
  const { itemName } = useData();
  return (
    <Link to={`/app/rentals/${r.id}`} className="rrow">
      <span className="rrow-main">
        <span className="rrow-title">{itemName(r.itemId)}</span>
        <span className="rrow-sub">
          {r.renterName} · {fmtDate(r.startsAt)} – {fmtDate(r.endsAt)} · <Mono>{r.id}</Mono>
        </span>
      </span>
      <span className="rrow-amt">{usd(holdOf(r))}</span>
      <StatusBadge status={r.status} />
      <IconArrowRight size={16} className="rrow-go" />
    </Link>
  );
}

function LoadingList() {
  return (
    <div className="card pad stack-sm">
      <Skeleton h={18} w="40%" />
      <Skeleton h={44} />
      <Skeleton h={44} />
      <Skeleton h={44} />
    </div>
  );
}

/* ---------- Overview ---------- */

export function Overview() {
  const { rentals, loading } = useData();
  const stats = useMemo(() => computeStats(rentals), [rentals]);
  const [events, setEvents] = useState<RentalEvent[] | null>(null);
  useEffect(() => {
    api.events(8).then(setEvents).catch(() => setEvents([]));
  }, [rentals]);
  const payments = useMemo(() => paymentRows(rentals).slice(0, 6), [rentals]);
  const attention = rentals.filter((r) => needsInspection(r) || r.status === 'hold_pending' || r.status === 'attention').slice(0, 5);

  return (
    <div className="page">
      <PageHeader title="Overview" sub="Live from your Handback server and PayPal sandbox." actions={<CreateRentalButton />} />
      <div className="stats">
        <Stat label="Active rentals" value={loading ? null : stats.active} hint="Held, out or awaiting review" />
        <Stat label="Deposits on hold" value={loading ? null : stats.heldCents} money hint={`${stats.heldCount} authorization${stats.heldCount === 1 ? '' : 's'} · not charged`} tone="info" />
        <Stat label="Completed settlements" value={loading ? null : stats.settled} hint={`${usd(stats.capturedCents)} captured · ${usd(stats.refundedCents)} refunded`} tone="good" />
        <Stat label="Pending inspections" value={loading ? null : stats.pendingInspections} hint="Photos or review due" tone={stats.pendingInspections ? 'warn' : undefined} />
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Needs your attention</h2>
            <Link to="/app/rentals" className="link-sm">
              All rentals <IconArrowRight size={14} />
            </Link>
          </div>
          {loading ? (
            <LoadingList />
          ) : attention.length ? (
            <div className="rlist">
              {attention.map((r) => (
                <RentalRow key={r.id} r={r} />
              ))}
            </div>
          ) : (
            <Empty
              icon={<IconRentals />}
              title={rentals.length ? 'All caught up' : 'No rentals yet'}
              body={rentals.length ? 'Nothing is waiting on photos, approval or review.' : 'Create a rental to place your first PayPal deposit hold.'}
              action={rentals.length ? undefined : <CreateRentalButton />}
            />
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Recent activity</h2>
            <Link to="/app/activity" className="link-sm">
              All activity <IconArrowRight size={14} />
            </Link>
          </div>
          {events === null ? <LoadingList /> : events.length ? <Timeline events={events} compact /> : <Empty icon={<IconActivity />} title="No activity yet" body="Rental, inspection and payment events appear here." />}
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Recent transactions</h2>
          <Link to="/app/payments" className="link-sm">
            All payments <IconArrowRight size={14} />
          </Link>
        </div>
        {payments.length ? <PaymentTable rows={payments} /> : <Empty icon={<IconCard />} title="No transactions yet" body="Authorizations, captures, releases and refunds will be listed with their PayPal IDs." />}
      </section>
    </div>
  );
}

function Stat({ label, value, hint, tone, money }: { label: string; value: number | null; hint: string; tone?: 'info' | 'good' | 'warn'; money?: boolean }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value === null ? <Skeleton h={30} w={80} /> : <NumberTicker value={value} format={money ? usdFmt : undefined} />}</div>
      <div className="stat-hint">{hint}</div>
    </div>
  );
}

/* ---------- Rentals ---------- */

export function Rentals() {
  const { rentals, loading, itemName } = useData();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const shown = rentals.filter((r) => FILTERS[filter](r) && matchesQuery(r, itemName(r.itemId), q));
  const counts = Object.fromEntries((Object.keys(FILTERS) as FilterKey[]).map((k) => [k, rentals.filter(FILTERS[k]).length])) as Record<FilterKey, number>;
  const labels: Record<FilterKey, string> = { all: 'All', active: 'Active', attention: 'Needs action', settled: 'Settled' };
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const selectable = shown.filter((r) => DELETABLE.includes(r.status));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allOn = selectable.length > 0 && selectable.every((r) => selected.includes(r.id));

  return (
    <div className="page">
      <PageHeader title="Rentals" sub="Every rental, its deposit and where it is in the handback." actions={<CreateRentalButton />} />
      <div className="toolbar">
        <label className="search">
          <IconSearch size={16} />
          <span className="sr-only">Search rentals</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by renter, item or ID" type="search" />
        </label>
        <div className="seg" role="group" aria-label="Filter rentals">
          {(Object.keys(FILTERS) as FilterKey[]).map((k) => (
            <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {filter === k && <SegPill group="rentals" />}
              <span className="seg-txt">
                {labels[k]} <span className="seg-count">{counts[k]}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      {selected.length > 0 && (
        <div className="bulkbar card">
          <span>
            <strong>{selected.length}</strong> selected
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected([])}>
            Clear
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => setConfirm(true)}>
            Delete
          </button>
        </div>
      )}
      <DeleteRentalsDialog ids={selected} open={confirm} onClose={() => setConfirm(false)} onDeleted={() => (setConfirm(false), setSelected([]))} />
      {loading ? (
        <LoadingList />
      ) : shown.length ? (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th scope="col" className="sel">
                  <input type="checkbox" aria-label="Select all deletable rentals" checked={allOn} disabled={!selectable.length} onChange={() => setSelected(allOn ? [] : selectable.map((r) => r.id))} />
                </th>
                <th scope="col">Item</th>
                <th scope="col">Renter</th>
                <th scope="col">Dates</th>
                <th scope="col" className="num">
                  Hold
                </th>
                <th scope="col">Inspection</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const insp = inspectionStage(r);
                return (
                  <tr key={r.id} className={`row-link ${selected.includes(r.id) ? 'is-selected' : ''}`} onClick={() => navigate(`/app/rentals/${r.id}`)}>
                    <td className="sel" data-label="Select" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.renterName}`}
                        checked={selected.includes(r.id)}
                        disabled={!DELETABLE.includes(r.status)}
                        title={DELETABLE.includes(r.status) ? undefined : 'Out or awaiting settlement: settle it first'}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                    <td data-label="Item">
                      <Link to={`/app/rentals/${r.id}`} className="cell-title">
                        {itemName(r.itemId)}
                      </Link>
                      <div className="cell-sub">
                        <Mono>{r.id}</Mono>
                      </div>
                    </td>
                    <td data-label="Renter">{r.renterName}</td>
                    <td data-label="Dates">
                      {fmtDate(r.startsAt)} – {fmtDate(r.endsAt)}
                      <div className="cell-sub">{durationDays(r.startsAt, r.endsAt)} days</div>
                    </td>
                    <td data-label="Hold" className="num">
                      {usd(holdOf(r))}
                      <div className="cell-sub">{r.rentalFeeCents ? `${usd(r.rentalFeeCents)} fee + ${usd(r.depositCents)} deposit` : 'deposit'}</div>
                    </td>
                    <td data-label="Inspection">
                      <Badge tone={insp.tone} dot={false}>
                        {insp.label}
                      </Badge>
                    </td>
                    <td data-label="Status">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card">
          <Empty
            icon={<IconRentals />}
            title={rentals.length ? 'No matching rentals' : 'No rentals yet'}
            body={rentals.length ? 'Try a different search or filter.' : 'Create a rental, then the renter approves the deposit hold in PayPal.'}
            action={rentals.length ? <button className="btn btn-ghost" onClick={() => (setQ(''), setFilter('all'))}>Clear filters</button> : <CreateRentalButton />}
          />
        </div>
      )}
    </div>
  );
}

/* ---------- Inspections ---------- */

export function Inspections() {
  const { rentals, loading, itemName } = useData();
  const inspected = rentals.filter((r) => r.status !== 'booked' && r.status !== 'hold_pending' && r.status !== 'cancelled');
  const due = inspected.filter(needsInspection);
  const done = inspected.filter((r) => !needsInspection(r));

  const Card = ({ r }: { r: Rental }) => {
    const insp = inspectionStage(r);
    const marks = Object.values(r.baseline).flat().length;
    const found = r.proposal?.lines.length ?? 0;
    return (
      <Link to={`/app/rentals/${r.id}`} className="icard">
        <div className="icard-thumbs">
          {r.pickupPhotos.slice(0, 2).map((p) => (
            <img key={p.angle} src={`${apiBase()}/rentals/${r.id}/photos/pickup/${p.angle}`} alt="" loading="lazy" />
          ))}
          {r.pickupPhotos.length === 0 && (
            <span className="icard-ph">
              <IconScan size={22} />
            </span>
          )}
        </div>
        <div className="icard-body">
          <div className="icard-title">{itemName(r.itemId)}</div>
          <div className="cell-sub">
            {r.renterName} · <Mono>{r.id}</Mono>
          </div>
          <div className="icard-meta">
            <Badge tone={insp.tone}>{insp.label}</Badge>
            {r.pickupPhotos.length > 0 && <span className="muted small">{marks} existing</span>}
            {r.proposal && <span className="muted small">· {found} new</span>}
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="page">
      <PageHeader title="Inspections" sub="Pick-up baselines and return comparisons, powered by Gemini vision. Findings are evidence; people approve charges." />
      {loading ? (
        <LoadingList />
      ) : inspected.length === 0 ? (
        <div className="card">
          <Empty icon={<IconScan />} title="No inspections yet" body="Inspections start once a renter's deposit hold is approved in PayPal." action={<CreateRentalButton />} />
        </div>
      ) : (
        <>
          <h2 className="section-label">Due now · {due.length}</h2>
          {due.length ? (
            <div className="icards">
              {due.map((r) => (
                <Card key={r.id} r={r} />
              ))}
            </div>
          ) : (
            <p className="muted">Nothing due.</p>
          )}
          <h2 className="section-label">Completed · {done.length}</h2>
          <div className="icards">
            {done.map((r) => (
              <Card key={r.id} r={r} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Payments ---------- */

const KIND: Record<PaymentKind, { label: string; sign: string }> = {
  authorization: { label: 'Authorization (hold)', sign: '' },
  capture: { label: 'Capture', sign: '' },
  release: { label: 'Released', sign: '' },
  refund: { label: 'Refund', sign: '−' },
};

function PaymentTable({ rows }: { rows: ReturnType<typeof paymentRows> }) {
  const { rentals, itemName } = useData();
  const rental = (id: string) => rentals.find((r) => r.id === id);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Type</th>
            <th scope="col">Rental</th>
            <th scope="col">PayPal reference</th>
            <th scope="col">Status</th>
            <th scope="col" className="num">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const r = rental(p.rentalId);
            return (
              <tr key={i}>
                <td data-label="Type">
                  <span className={`pkind pkind-${p.kind}`}>{KIND[p.kind].label}</span>
                </td>
                <td data-label="Rental">
                  <Link to={`/app/rentals/${p.rentalId}`} className="cell-title">
                    {r ? itemName(r.itemId) : p.rentalId}
                  </Link>
                  <div className="cell-sub">{r?.renterName}</div>
                </td>
                <td data-label="Reference">{p.reference ? <Mono>{p.reference}</Mono> : <span className="muted">—</span>}</td>
                <td data-label="Status">
                  <Badge tone={p.tone}>{p.status}</Badge>
                </td>
                <td data-label="Amount" className="num strong">
                  {KIND[p.kind].sign}
                  {usd(p.amountCents)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Payments() {
  const { rentals, loading } = useData();
  const rows = useMemo(() => paymentRows(rentals), [rentals]);
  const stats = computeStats(rentals);
  return (
    <div className="page">
      <PageHeader title="Payments" sub="Every PayPal sandbox movement, derived from rental state. An authorization is a hold, not a charge." />
      <div className="stats stats-3">
        <Stat label="On hold (authorized)" value={loading ? null : stats.heldCents} money hint="Reserved on the renter’s PayPal, not charged" tone="info" />
        <Stat label="Captured" value={loading ? null : stats.capturedCents} money hint="Approved deductions actually charged" />
        <Stat label="Refunded" value={loading ? null : stats.refundedCents} money hint="Returned after upheld appeals" tone="good" />
      </div>
      <section className="card">
        <div className="card-head">
          <h2>Transactions</h2>
          <span className="muted small">{rows.length} entries</span>
        </div>
        {loading ? <LoadingList /> : rows.length ? <PaymentTable rows={rows} /> : <Empty icon={<IconCard />} title="No PayPal activity yet" body="Once a renter approves a deposit, the authorization appears here with its PayPal ID." />}
      </section>
    </div>
  );
}

/* ---------- Activity ---------- */

export function Timeline({ events, compact = false }: { events: RentalEvent[]; compact?: boolean }) {
  const { rentals, itemName } = useData();
  return (
    <ol className={`timeline ${compact ? 'is-compact' : ''}`}>
      {events.map((e, i) => {
        const g = eventGroup(e.kind);
        const r = e.rentalId ? rentals.find((x) => x.id === e.rentalId) : undefined;
        const detail = eventDetail(e);
        return (
          <li key={i} className={`tl tl-${g} ${e.kind.includes('failed') ? 'tl-bad' : ''}`}>
            <span className="tl-dot" aria-hidden="true" />
            <div className="tl-body">
              <div className="tl-title">{eventLabel(e.kind)}</div>
              <div className="tl-sub">
                {r && !compact && (
                  <>
                    <Link to={`/app/rentals/${r.id}`}>{itemName(r.itemId)}</Link> ·{' '}
                  </>
                )}
                {detail && <>{detail} · </>}
                <time dateTime={e.at}>{fmtDateTime(e.at)}</time>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Activity() {
  const [events, setEvents] = useState<RentalEvent[] | null>(null);
  const [group, setGroup] = useState<'all' | 'rental' | 'inspection' | 'payment'>('all');
  const [error, setError] = useState('');
  useEffect(() => {
    api
      .events(300)
      .then(setEvents)
      .catch((e) => setError((e as Error).message));
  }, []);
  const shown = (events ?? []).filter((e) => group === 'all' || eventGroup(e.kind) === group);
  return (
    <div className="page">
      <PageHeader title="Activity" sub="Rental, inspection and payment events, newest first." />
      <div className="toolbar">
        <div className="seg" role="group" aria-label="Filter activity">
          {(['all', 'rental', 'inspection', 'payment'] as const).map((g) => (
            <button key={g} aria-pressed={group === g} onClick={() => setGroup(g)} className="cap">
              {group === g && <SegPill group="activity" />}
              <span className="seg-txt">{g}</span>
            </button>
          ))}
        </div>
      </div>
      {error && <Alert tone="bad">{error}</Alert>}
      <section className="card pad">
        {events === null ? <LoadingList /> : shown.length ? <Timeline events={shown} /> : <Empty icon={<IconActivity />} title="Nothing here yet" body="Events appear as rentals move through the handback." />}
      </section>
    </div>
  );
}

/* ---------- Settings ---------- */

export function Settings() {
  const { config, items } = useData();
  const [theme, setTheme] = useState<ThemePref>(getThemePref);
  const [shop, setShop] = useState(() => {
    try {
      return localStorage.getItem('handback-shop-name') ?? 'Lensworks Rentals';
    } catch {
      return 'Lensworks Rentals';
    }
  });
  const [saved, setSaved] = useState(false);
  const pick = (t: ThemePref) => {
    setTheme(t);
    setThemePref(t);
  };
  const forgetToken = () => {
    try {
      localStorage.removeItem('handback-shop-token');
    } catch {
      /* ignore */
    }
    setSaved(true);
  };
  return (
    <div className="page narrow">
      <PageHeader title="Settings" sub="Preferences are saved in this browser only." />
      <section className="card pad stack">
        <h2>Appearance</h2>
        <div className="theme-pick" role="radiogroup" aria-label="Theme">
          {(['light', 'dark', 'system'] as ThemePref[]).map((t) => (
            <button key={t} role="radio" aria-checked={theme === t} className={`theme-opt ${theme === t ? 'is-on' : ''}`} onClick={() => pick(t)}>
              <span className={`theme-swatch sw-${t}`} aria-hidden="true" />
              <span className="cap">{t}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="card pad stack">
        <h2>Shop profile</h2>
        <label className="field">
          <span>Display name</span>
          <input
            value={shop}
            onChange={(e) => {
              setShop(e.target.value);
              try {
                localStorage.setItem('handback-shop-name', e.target.value);
              } catch {
                /* ignore */
              }
            }}
          />
        </label>
        <div className="field">
          <span>Approval token</span>
          <p className="muted small">Settlements and refunds ask for the shop token from <code>.env</code> (SHOP_ADMIN_TOKEN) once, then remember it here.</p>
          <div>
            <button className="btn btn-ghost btn-sm" onClick={forgetToken}>
              Forget saved token
            </button>
            {saved && <span className="muted small"> Cleared.</span>}
          </div>
        </div>
      </section>
      <section className="card pad stack">
        <h2>Demo data</h2>
        <p className="muted small">
          Switch to a separate workspace of sample rentals, one at every stage, with simulated PayPal and simulated AI. Your real rentals are untouched; switch back any time.
        </p>
        <div>
          {isDemoMode() ? (
            <button className="btn btn-primary btn-sm" onClick={() => setDemoMode(false)}>
              Exit demo, back to real data
            </button>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => setDemoMode(true)}>
              Try the demo
            </button>
          )}
        </div>
      </section>
      <section className="card pad stack">
        <h2>Environment</h2>
        <dl className="kv">
          <div>
            <dt>Payments</dt>
            <dd>
              {config?.demo ? <Badge tone="info">Simulated (demo)</Badge> : <Badge tone={config?.features.paypal ? 'good' : 'bad'}>{config?.features.paypal ? 'PayPal sandbox connected' : 'PayPal keys missing'}</Badge>}
            </dd>
          </div>
          <div>
            <dt>AI inspections</dt>
            <dd>
              {config?.demo ? <Badge tone="info">Simulated (demo)</Badge> : <Badge tone={config?.features.ai ? 'good' : 'bad'}>{config?.features.ai ? 'Gemini configured' : 'Gemini key missing'}</Badge>}
            </dd>
          </div>
          <div>
            <dt>Storage</dt>
            <dd>{config?.features.db ? 'PostgreSQL' : 'In-memory (resets when the server restarts)'}</dd>
          </div>
          <div>
            <dt>Webhooks</dt>
            <dd>{config?.features.webhooks ? 'Signature verification on' : 'Not configured (optional locally)'}</dd>
          </div>
          <div>
            <dt>Catalog</dt>
            <dd>{items.length} items</dd>
          </div>
        </dl>
        <p className="fine">Sandbox only. Handback refuses to start with live PayPal credentials in this build.</p>
      </section>
    </div>
  );
}

export { isActive };
