import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiBase, compress, holdOf, usd, type Item, type Line, type Photo, type Rental, type RentalEvent } from '../api';
import { BoxedPhoto, ComparePanel } from '../components/Inspection';
import { IconArrowLeft, IconCamera, IconCheck, IconLock, IconReceipt } from '../components/icons';
import { Alert, Badge, Link, Mono, Spinner } from '../components/ui';
import { useData } from '../lib/data';
import { durationDays, fmtDateTime, inspectionStage, STAGES, statusInfo } from '../lib/derive';
import { navigate } from '../router';
import { DELETABLE, DeleteRentalsDialog, Timeline } from './pages';
import { motion } from 'motion/react';
import { DepositGauge, NumberTicker, ShimmerText, SlideToConfirm, stagger, usdFmt } from '../components/fx';

declare global {
  interface Window {
    paypal?: {
      Buttons: (o: {
        style?: Record<string, unknown>;
        createOrder: () => Promise<string>;
        onApprove: () => Promise<void>;
        onError?: (e: unknown) => void;
        onCancel?: () => void;
      }) => { render: (el: HTMLElement) => Promise<void> };
    };
  }
}

function loadPayPalSdk(clientId: string): Promise<void> {
  if (window.paypal) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>('script[data-paypal-sdk]');
  if (existing) return new Promise((res, rej) => (existing.addEventListener('load', () => res()), existing.addEventListener('error', () => rej(new Error('Could not load PayPal')))));
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&intent=authorize&currency=USD&components=buttons`;
    s.dataset.paypalSdk = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the PayPal button. Check your connection and PAYPAL_CLIENT_ID.'));
    document.head.appendChild(s);
  });
}

/* ---------- Capture photos per angle ---------- */

function PhotoCapture({ angles, onSubmit, busy, cta, hint }: { angles: string[]; onSubmit: (p: Photo[]) => void; busy: boolean; cta: string; hint: string }) {
  const [photos, setPhotos] = useState<Record<string, { photo: Photo; preview: string }>>({});
  const [err, setErr] = useState('');
  const done = angles.filter((a) => photos[a]).length;
  return (
    <div className="capture">
      <div className="capture-grid">
        {angles.map((a, i) => (
          <label key={a} className={`shot ${photos[a] ? 'is-done' : ''}`}>
            {photos[a] ? (
              <img src={photos[a]!.preview} alt={`${a} photo`} />
            ) : (
              <span className="shot-empty">
                <IconCamera size={22} />
                <span>Add photo</span>
              </span>
            )}
            <span className="shot-name">
              <span className="shot-idx">{i + 1}</span>
              {a}
              {photos[a] && <IconCheck size={14} />}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="sr-only"
              aria-label={`${a} photo`}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setErr('');
                try {
                  const photo = await compress(file, a);
                  setPhotos((p) => ({ ...p, [a]: { photo, preview: `data:image/jpeg;base64,${photo.data}` } }));
                } catch {
                  setErr(`Could not read the ${a} photo. Use a JPEG, PNG or WebP image.`);
                }
              }}
            />
          </label>
        ))}
      </div>
      <p className="muted small">{hint}</p>
      {err && <Alert tone="bad">{err}</Alert>}
      <div className="capture-foot">
        <div className="progress" aria-label={`${done} of ${angles.length} photos added`}>
          <span className="progress-bar">
            <span style={{ width: `${(done / angles.length) * 100}%` }} />
          </span>
          <span className="small muted">
            {done}/{angles.length} angles
          </span>
        </div>
        <button className="btn btn-primary" disabled={done < angles.length || busy} onClick={() => onSubmit(angles.map((a) => photos[a]!.photo))}>
          {busy ? <ShimmerText>Gemini is inspecting {angles.length} angles…</ShimmerText> : cta}
        </button>
      </div>
    </div>
  );
}

/* ---------- Stepper ---------- */

function Stepper({ status }: { status: string }) {
  const s = statusInfo(status);
  const done = status === 'settled_captured' || status === 'settled_void';
  return (
    <ol className="stepper" aria-label="Rental progress">
      {STAGES.map((label, i) => {
        const state = done || i < s.stage ? 'done' : i === s.stage ? 'current' : 'todo';
        return (
          <li key={label} className={`stp stp-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="stp-dot">{state === 'done' ? <IconCheck size={13} /> : i + 1}</span>
            <span className="stp-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Page ---------- */

export function RentalDetail({ id }: { id: string }) {
  const { config, refresh: refreshAll } = useData();
  const [data, setData] = useState<{ rental: Rental; item: Item; events: RentalEvent[] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retake, setRetake] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const ppRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  const refresh = useCallback(async () => {
    const d = await api.rental(id);
    setData(d);
    if (d.rental.proposal) setLines(d.rental.settlement?.lines ?? d.rental.proposal.lines);
  }, [id]);

  useEffect(() => {
    refresh().catch((e) => setError((e as Error).message));
  }, [refresh]);

  /** One action at a time: blocks double clicks even before React re-renders. */
  const run = async (fn: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    setRetake([]);
    try {
      await fn();
      await refresh();
      void refreshAll();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // Back from PayPal's redirect flow: confirm approval on the server.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('paypal');
    if (!p) return;
    window.history.replaceState({}, '', window.location.pathname);
    if (p === 'return') void run(() => api.authorize(id));
    if (p === 'cancel') setNotice('PayPal approval was cancelled. Nothing was held.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const status = data?.rental.status;
  useEffect(() => {
    if (!config?.paypalClientId || !ppRef.current || (status !== 'booked' && status !== 'hold_pending')) return;
    let cancelled = false;
    const el = ppRef.current;
    loadPayPalSdk(config.paypalClientId)
      .then(() => {
        if (cancelled || !window.paypal) return;
        el.innerHTML = '';
        return window.paypal
          .Buttons({
            style: { layout: 'vertical', label: 'paypal', shape: 'rect', height: 44 },
            createOrder: async () => (await api.createOrder(id)).orderId,
            onApprove: () => run(() => api.authorize(id)),
            onCancel: () => setNotice('PayPal approval was cancelled. Nothing was held.'),
            onError: (e) => setError(`PayPal: ${String((e as Error)?.message ?? e)}`),
          })
          .render(el);
      })
      .catch((e) => setError((e as Error).message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.paypalClientId, status, id]);

  if (!data) {
    return (
      <div className="page">
        {error ? (
          <Alert tone="bad">
            {error}{' '}
            <Link to="/app/rentals" className="link-sm">
              Back to rentals
            </Link>
          </Alert>
        ) : (
          <Spinner label="Loading rental…" />
        )}
      </div>
    );
  }

  const { rental: r, item, events } = data;
  const photo = (phase: 'pickup' | 'return', a: string) => `${apiBase()}/rentals/${r.id}/photos/${phase}/${a}`;
  const reviewing = r.status === 'returned';
  const priced = lines.filter((l) => !l.needsReview);
  const fee = r.rentalFeeCents ?? 0;
  const hold = holdOf(r);
  const damage = Math.min(priced.reduce((s, l) => s + l.amountCents, 0), r.depositCents);
  const total = fee + damage;
  const canCancel = r.status === 'booked' || r.status === 'hold_pending' || (r.status === 'held' && !r.baselineAcknowledgedAt);
  const canDelete = DELETABLE.includes(r.status);
  const settledTotal = r.settlement?.totalCents;
  const insp = inspectionStage(r);
  const s = statusInfo(r.status);

  const submitPhotos = (kind: 'pickup' | 'return') => (photos: Photo[]) =>
    run(async () => {
      const res = kind === 'pickup' ? await api.pickup(r.id, photos) : await api.returnItem(r.id, photos);
      if (!res.ok) {
        setRetake(res.retake);
        throw new Error('Some photos need a retake. Details below.');
      }
    });

  return (
    <div className="page">
      <Link to="/app/rentals" className="back">
        <IconArrowLeft size={16} /> Rentals
      </Link>
      <div className="detail-head">
        <div>
          <h1>{item.name}</h1>
          <p className="muted">
            {r.renterName} · <Mono>{r.id}</Mono>
          </p>
        </div>
        <Badge tone={s.tone}>{s.label}</Badge>
      </div>
      <Stepper status={r.status} />

      {error && <Alert tone="bad" onClose={() => setError('')}>{error}</Alert>}
      {retake.length > 0 && (
        <Alert tone="warn">
          <strong>Retake needed</strong>
          <ul className="retake">
            {retake.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Alert>
      )}
      {notice && <Alert tone="info" onClose={() => setNotice('')}>{notice}</Alert>}

      <div className="detail">
        <div className="detail-main">
          {(r.status === 'booked' || r.status === 'hold_pending') && (
            <section className="card pad action">
              <div className="action-head">
                <span className="action-num">1</span>
                <div>
                  <h2>Hold {usd(hold)} on PayPal</h2>
                  <p className="muted">
                    {fee ? `${usd(fee)} rental fee + ${usd(r.depositCents)} refundable deposit. ` : ''}The renter approves a PayPal authorization. Nothing is charged until the item comes back.
                  </p>
                </div>
              </div>
              {config?.demo ? (
                <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api.demoApprove(r.id))}>
                  {busy ? <Spinner label="Approving…" /> : 'Simulate renter approving on PayPal (demo)'}
                </button>
              ) : config?.paypalClientId ? (
                <div ref={ppRef} className="pp-buttons" />
              ) : (
                <Alert tone="warn">Add PAYPAL_CLIENT_ID to .env and restart to show the PayPal button.</Alert>
              )}
              {r.paypalOrderId && !config?.demo && (
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api.authorize(r.id))}>
                  {busy ? <Spinner label="Checking with PayPal…" /> : 'I approved in another window: check PayPal'}
                </button>
              )}
            </section>
          )}

          {r.status === 'held' && r.pickupPhotos.length === 0 && (
            <section className="card pad action">
              <div className="action-head">
                <span className="action-num">2</span>
                <div>
                  <h2>Pick-up inspection</h2>
                  <p className="muted">One photo per angle. Gemini lists every existing mark so the renter never pays for them.</p>
                </div>
              </div>
              <PhotoCapture angles={item.angles} busy={busy} cta="Run pick-up inspection" hint="Plain background, good light, the whole item in frame. Use the same framing at return." onSubmit={submitPhotos('pickup')} />
            </section>
          )}

          {r.pickupPhotos.length > 0 && !r.proposal && (
            <section className="card pad">
              <div className="card-head">
                <h2>Pick-up baseline</h2>
                {r.baselineAcknowledgedAt ? <Badge tone="good">Signed by renter</Badge> : <Badge tone="warn">Awaiting renter sign-off</Badge>}
              </div>
              <div className="baseline-grid">
                {item.angles.map((a) => {
                  const marks = r.baseline[a] ?? [];
                  return (
                    <figure key={a} className="bfig">
                      <BoxedPhoto src={photo('pickup', a)} alt={`${a} at pick-up`} marks={marks.map((f, i) => ({ f, tag: `E${i + 1}`, kind: 'existing' }))} />
                      <figcaption>
                        <strong className="cap">{a}</strong>
                        <span className="muted small">{marks.length ? marks.map((m) => m.label).join(' · ') : 'No existing marks'}</span>
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
              {r.status === 'held' ? (
                <div className="sign">
                  <p>
                    <strong>{r.renterName}</strong>, these marks were on the item when you picked it up. You won't be charged for them.
                  </p>
                  <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api.acknowledge(r.id))}>
                    {busy ? <Spinner label="Saving…" /> : 'Renter agrees: start rental'}
                  </button>
                </div>
              ) : (
                r.baselineAcknowledgedAt && <p className="muted small">Signed off {fmtDateTime(r.baselineAcknowledgedAt)}.</p>
              )}
            </section>
          )}

          {r.status === 'out' && (
            <section className="card pad action">
              <div className="action-head">
                <span className="action-num">3</span>
                <div>
                  <h2>Return inspection</h2>
                  <p className="muted">Same angles as pick-up. Gemini compares each one against the signed baseline.</p>
                </div>
              </div>
              <PhotoCapture angles={item.angles} busy={busy} cta="Compare with pick-up" hint="Match the pick-up framing as closely as you can." onSubmit={submitPhotos('return')} />
            </section>
          )}

          {r.proposal && (
            <>
              <section className="stack">
                <div className="card-head bare">
                  <h2>Return comparison</h2>
                  <Badge tone={insp.tone}>{insp.label}</Badge>
                </div>
                {item.angles.map((a) => (
                  <div className="card pad" key={a}>
                    <ComparePanel
                      angle={a}
                      beforeSrc={photo('pickup', a)}
                      afterSrc={photo('return', a)}
                      existing={r.baseline[a] ?? []}
                      found={r.proposal!.lines.filter((l) => l.angle === a)}
                      ignored={r.proposal!.matchedPreexisting[a] ?? []}
                    />
                  </div>
                ))}
              </section>

              <section className="card pad settle-card">
                <div className="card-head">
                  <h2>{reviewing ? 'Review and settle' : 'Settlement'}</h2>
                  <span className="muted small">Prices from the shop's list · capped at the hold</span>
                </div>
                <div className="table-wrap">
                  <table className="table lines">
                    <thead>
                      <tr>
                        <th scope="col">Finding</th>
                        <th scope="col">Angle</th>
                        <th scope="col">Severity</th>
                        <th scope="col">Charge</th>
                        <th scope="col" className="num">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={i} className={l.needsReview ? 'is-review' : ''}>
                          <td data-label="Finding">
                            {l.label}
                            {l.needsReview && (
                              <div className="cell-sub warn-text">Low confidence ({Math.round(l.confidence * 100)}%): not charged unless you include it</div>
                            )}
                          </td>
                          <td data-label="Angle" className="cap">
                            {l.angle}
                          </td>
                          <td data-label="Severity" className="cap">
                            {l.severity}
                          </td>
                          <td data-label="Charge">
                            {reviewing ? (
                              <label className="check">
                                <input
                                  type="checkbox"
                                  checked={!l.needsReview}
                                  onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, needsReview: !e.target.checked } : x)))}
                                />
                                <span>{l.needsReview ? 'Excluded' : 'Included'}</span>
                              </label>
                            ) : l.needsReview ? (
                              'Excluded'
                            ) : (
                              'Included'
                            )}
                          </td>
                          <td data-label="Amount" className="num">
                            {reviewing ? (
                              <span className="money-input">
                                <span aria-hidden="true">$</span>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  inputMode="decimal"
                                  aria-label={`Amount for ${l.label}`}
                                  value={(l.amountCents / 100).toFixed(2)}
                                  onChange={(e) => {
                                    const v = Math.max(0, Math.round(Number(e.target.value || 0) * 100));
                                    setLines((ls) => ls.map((x, j) => (j === i ? { ...x, amountCents: v } : x)));
                                  }}
                                />
                              </span>
                            ) : (
                              usd(l.amountCents)
                            )}
                          </td>
                        </tr>
                      ))}
                      {lines.length === 0 && (
                        <tr>
                          <td colSpan={5} className="muted">
                            No new damage found. Approving charges only the rental fee and releases the full deposit.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {reviewing && (
                  <div className="settle-bar">
                    <div className="settle-sum">
                      {fee > 0 && (
                        <div>
                          <span className="muted small">Rental fee</span>
                          <strong>
                            <NumberTicker value={fee} format={usdFmt} />
                          </strong>
                        </div>
                      )}
                      <div>
                        <span className="muted small">Damage</span>
                        <strong className={damage ? 'bad-text' : ''}>
                          <NumberTicker value={damage} format={usdFmt} />
                        </strong>
                      </div>
                      <div>
                        <span className="muted small">Release to {r.renterName}</span>
                        <strong className="good-text">
                          <NumberTicker value={hold - total} format={usdFmt} />
                        </strong>
                      </div>
                    </div>
                    <div className="settle-go">
                      <SlideToConfirm
                        label={total === 0 ? 'Slide to release the full hold' : `Slide to capture ${usd(total)}`}
                        busy={busy}
                        onConfirm={() => void run(() => api.settle(r.id, priced))}
                      />
                      <span className="fine">Owner approval · PayPal sandbox · idempotent</span>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          {(r.status === 'settled_captured' || r.status === 'settled_void' || r.status === 'attention') && (
            <section className="card pad receipt">
              <div className="receipt-head">
                <IconReceipt size={22} />
                <div>
                  <h2>PayPal receipt</h2>
                  <p className="muted small">Sandbox transaction · {r.status === 'attention' ? 'capture pending at PayPal' : 'final'}</p>
                </div>
              </div>
              <div className="receipt-top">
                <DepositGauge depositCents={hold} capturedCents={r.captureId ? (r.capturedCents ?? 0) - (r.refundedCents ?? 0) : 0} label="of hold captured" size={200} />
              </div>
              <motion.dl className="receipt-lines" variants={stagger.parent} initial="hidden" animate="show">
                <motion.div variants={stagger.child}>
                  <dt>Held on PayPal{fee ? ' (fee + deposit)' : ''}</dt>
                  <dd>{usd(hold)}</dd>
                </motion.div>
                {r.captureId ? (
                  <>
                    {(r.settlement?.feeCents ?? 0) > 0 && (
                      <motion.div variants={stagger.child}>
                        <dt>Rental fee</dt>
                        <dd>{usd(r.settlement!.feeCents!)}</dd>
                      </motion.div>
                    )}
                    <motion.div variants={stagger.child}>
                      <dt>Captured for new damage</dt>
                      <dd className={(r.settlement?.damageCents ?? 0) > 0 ? 'bad-text' : ''}>{usd(r.settlement?.damageCents ?? (r.capturedCents ?? 0) - (r.settlement?.feeCents ?? 0))}</dd>
                    </motion.div>
                    <motion.div variants={stagger.child} className="total">
                      <dt>Released to renter</dt>
                      <dd className="good-text">{usd(hold - (r.capturedCents ?? 0))}</dd>
                    </motion.div>
                  </>
                ) : (
                  <motion.div variants={stagger.child} className="total">
                    <dt>Hold voided · released</dt>
                    <dd className="good-text">{usd(hold)}</dd>
                  </motion.div>
                )}
                {r.refundedCents ? (
                  <motion.div variants={stagger.child}>
                    <dt>Refunded on appeal</dt>
                    <dd className="good-text">{usd(r.refundedCents)}</dd>
                  </motion.div>
                ) : null}
              </motion.dl>
              <dl className="ids">
                <div>
                  <dt>Authorization</dt>
                  <dd>
                    <Mono>{r.authorizationId}</Mono>
                  </dd>
                </div>
                {r.captureId && (
                  <div>
                    <dt>Capture</dt>
                    <dd>
                      <Mono>{r.captureId}</Mono>
                    </dd>
                  </div>
                )}
                {r.paypalOrderId && (
                  <div>
                    <dt>Order</dt>
                    <dd>
                      <Mono>{r.paypalOrderId}</Mono>
                    </dd>
                  </div>
                )}
              </dl>
              {settledTotal !== undefined && r.status === 'settled_captured' && (r.capturedCents ?? 0) > (r.refundedCents ?? 0) && (
                <button
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    const left = (r.capturedCents ?? 0) - (r.refundedCents ?? 0);
                    const v = window.prompt(`Uphold the renter's appeal: refund how much? (up to ${usd(left)})`, (left / 100).toFixed(2));
                    if (!v) return;
                    const cents = Math.round(Number(v) * 100);
                    if (!Number.isFinite(cents) || cents <= 0 || cents > left) {
                      setError(`Enter an amount between $0.01 and ${usd(left)}.`);
                      return;
                    }
                    void run(() => api.refund(r.id, cents, 'Appeal upheld'));
                  }}
                >
                  {busy ? <Spinner label="Refunding…" /> : 'Uphold appeal: refund'}
                </button>
              )}
            </section>
          )}
        </div>

        <aside className="detail-side">
          <section className="card pad">
            <h2 className="side-h">Rental</h2>
            <dl className="kv">
              <div>
                <dt>Item</dt>
                <dd>{item.name}</dd>
              </div>
              <div>
                <dt>Renter</dt>
                <dd>{r.renterName}</dd>
              </div>
              <div>
                <dt>Pick-up</dt>
                <dd>{fmtDateTime(r.startsAt)}</dd>
              </div>
              <div>
                <dt>Return</dt>
                <dd>{fmtDateTime(r.endsAt)}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{durationDays(r.startsAt, r.endsAt)} days</dd>
              </div>
            </dl>
          </section>
          <section className="card pad">
            <h2 className="side-h">PayPal hold</h2>
            <div className="deposit">
              <span className="deposit-amt">{usd(hold)}</span>
              <span className="deposit-state">
                <IconLock size={14} />
                {r.authorizationId ? (r.status === 'settled_void' || r.status === 'cancelled' ? 'Released' : r.captureId ? 'Settled' : 'Held, not charged') : 'Not yet authorized'}
              </span>
            </div>
            <dl className="kv">
              <div>
                <dt>Rental fee</dt>
                <dd>{usd(fee)}</dd>
              </div>
              <div>
                <dt>Refundable deposit</dt>
                <dd>{usd(r.depositCents)}</dd>
              </div>
              <div>
                <dt>Inspection</dt>
                <dd>
                  <Badge tone={insp.tone} dot={false}>
                    {insp.label}
                  </Badge>
                </dd>
              </div>
              {r.authorizationId && (
                <div>
                  <dt>Authorization</dt>
                  <dd>
                    <Mono>{r.authorizationId}</Mono>
                  </dd>
                </div>
              )}
            </dl>
          </section>
          <section className="card pad">
            <h2 className="side-h">Activity</h2>
            {events.length ? <Timeline events={[...events].reverse()} compact /> : <p className="muted small">No events yet.</p>}
          </section>
          {(canCancel || canDelete) && (
            <section className="card pad manage">
              <h2 className="side-h">Manage</h2>
              {canCancel && (
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api.cancel(r.id))}>
                  {r.status === 'held' ? 'Cancel rental and release the hold' : 'Cancel rental'}
                </button>
              )}
              {canDelete && (
                <button className="btn btn-danger-ghost btn-sm" onClick={() => setConfirmDelete(true)}>
                  Delete rental
                </button>
              )}
              <DeleteRentalsDialog ids={[r.id]} open={confirmDelete} onClose={() => setConfirmDelete(false)} onDeleted={() => navigate('/app/rentals')} />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
