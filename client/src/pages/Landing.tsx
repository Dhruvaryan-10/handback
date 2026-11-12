import { useEffect, useState } from 'react';
import { setDemoMode } from '../api';
import { ComparePanel, Confidence } from '../components/Inspection';
import {
  IconAlert,
  IconArrowRight,
  IconCamera,
  IconCard,
  IconCheck,
  IconEye,
  IconLock,
  IconLogo,
  IconMenu,
  IconReceipt,
  IconRentals,
  IconScale,
  IconScan,
  IconShield,
  IconUser,
  IconX,
} from '../components/icons';
import { Badge, Link } from '../components/ui';
import { demoAfter, demoBefore, demoExisting, demoFound } from '../lib/demoArt';
import { ThemeToggle } from '../components/ThemeToggle';
import { motion } from 'motion/react';
import { DepositGauge, Reveal, Spotlight } from '../components/fx';
import { HeroStage } from '../components/HeroStage';

const heroItem = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.2, 0.8, 0.2, 1] as const } } };

const NAV = [
  { id: 'product', label: 'Product' },
  { id: 'how', label: 'How it works' },
  { id: 'features', label: 'Features' },
  { id: 'security', label: 'Security' },
];

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function Landing() {
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => {
    document.title = 'Handback · Rent with confidence. Return with proof.';
  }, []);

  const go = (id: string) => {
    setMenu(false);
    scrollTo(id);
  };

  return (
    <div className="landing">
      <a href="#main" className="skip">
        Skip to content
      </a>
      <header className={`lnav ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="lnav-inner">
          <a href="/" className="brand" aria-label="Handback home">
            <IconLogo /> <span>Handback</span>
          </a>
          <nav className={`lnav-links ${menu ? 'is-open' : ''}`} aria-label="Sections">
            {NAV.map((n) => (
              <button key={n.id} className="lnav-link" onClick={() => go(n.id)}>
                {n.label}
              </button>
            ))}
            <Link to="/app" className="btn btn-primary lnav-cta-mobile">
              Launch app
            </Link>
          </nav>
          <div className="lnav-right">
            <ThemeToggle />
            <Link to="/app" className="btn btn-primary btn-sm lnav-cta">
              Launch app
            </Link>
            <button className="icon-btn lnav-burger" aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} onClick={() => setMenu(!menu)}>
              {menu ? <IconX /> : <IconMenu />}
            </button>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="hero" id="product">
          <motion.div className="container hero-copy" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}>
            <motion.p variants={heroItem} className="hero-product">
              Handback
            </motion.p>
            <motion.h1 variants={heroItem} className="display">
              Every rental deserves
              <br /> a fair handback.
            </motion.h1>
            <motion.p variants={heroItem} className="lead">
              AI-powered inspections. Transparent deposits. A smarter way to protect rental businesses and customers.
            </motion.p>
            <motion.div variants={heroItem} className="hero-ctas">
              <Link to="/app" className="btn btn-primary btn-lg">
                Launch Handback
              </Link>
              <button className="btn btn-ghost btn-lg" onClick={() => setDemoMode(true)}>
                Try the demo
              </button>
              <button className="btn-link" onClick={() => scrollTo('how')}>
                See how it works <span aria-hidden="true">›</span>
              </button>
            </motion.div>
          </motion.div>
          <div className="container">
            <HeroStage />
          </div>
          <div className="container facts">
            {[
              { big: '$0', t: 'charged at pick-up', d: 'The deposit is a PayPal authorization: a hold, not a payment.' },
              { big: '1', t: 'question per photo', d: 'What is here now that wasn’t at pick-up? Old marks never cost a thing.' },
              { big: 'Every', t: 'charge approved by a person', d: 'The AI reports. The shop decides. PayPal moves only that amount.' },
            ].map((f, i) => (
              <Reveal key={f.t} className="fact" delay={i * 0.08}>
                <div className="fact-big">{f.big}</div>
                <div className="fact-t">{f.t}</div>
                <p>{f.d}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="problem-h">
          <div className="container">
            <Reveal className="section-head">
              <span className="kicker">The problem</span>
              <h2 id="problem-h">"That scratch was already there."</h2>
              <p className="lead-sm">Every rental shop has had this argument. Without a shared record, someone loses: the shop eats the cost, or the customer leaves angry.</p>
            </Reveal>
            <div className="problems">
              {[
                { icon: <IconEye />, t: 'Unclear original condition', d: 'Nobody can prove what the item looked like when it left the counter.' },
                { icon: <IconAlert />, t: 'Disputed damage', d: 'Every mark at return becomes a negotiation, with no evidence either side trusts.' },
                { icon: <IconScale />, t: 'Unfair deductions', d: 'Deposits are kept in full or refunded in full, rarely matched to the actual damage.' },
                { icon: <IconCamera />, t: 'Manual inspection', d: 'Staff eyeball items in a rush at the counter, inconsistently between shifts.' },
                { icon: <IconReceipt />, t: 'Opaque payments', d: 'Customers rarely see what was held, what was charged and why.' },
              ].map((p, idx) => (
                <Reveal className="problem" key={p.t} delay={0.05 * idx}>
                  <span className="problem-icon">{p.icon}</span>
                  <h3>{p.t}</h3>
                  <p>{p.d}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="section section-alt" id="features" aria-labelledby="solution-h">
          <div className="container">
            <Reveal className="section-head">
              <span className="kicker">The solution</span>
              <h2 id="solution-h">One record of condition. One fair settlement.</h2>
              <p className="lead-sm">Handback ties the evidence to the money: the photos decide what is new, the shop's price list decides what it costs, and PayPal moves exactly that amount.</p>
            </Reveal>
            <div className="features">
              <Spotlight className="feature feature-wide">
                <span className="feature-icon">
                  <IconScan />
                </span>
                <h3>Signed baseline at pick-up</h3>
                <p>AI lists every existing mark on each angle. The renter reviews and agrees before the item leaves, so nobody pays for history.</p>
              </Spotlight>
              <Spotlight className="feature">
                <span className="feature-icon">
                  <IconEye />
                </span>
                <h3>Diff, not a guess</h3>
                <p>At return, the AI is asked one question per angle: what is here now that wasn't before?</p>
              </Spotlight>
              <Spotlight className="feature">
                <span className="feature-icon">
                  <IconCard />
                </span>
                <h3>Hold, then settle</h3>
                <p>The deposit is a PayPal authorization. Settlement captures the deduction and releases the rest in one call.</p>
              </Spotlight>
              <Spotlight className="feature">
                <span className="feature-icon">
                  <IconUser />
                </span>
                <h3>People decide money</h3>
                <p>Prices come from the shop's list, low-confidence findings go to review, and the owner approves every charge.</p>
              </Spotlight>
              <Spotlight className="feature">
                <span className="feature-icon">
                  <IconReceipt />
                </span>
                <h3>Receipt with evidence</h3>
                <p>Before and after crops, line items and PayPal IDs on one page. Appeals end in a partial refund, not an argument.</p>
              </Spotlight>
            </div>
          </div>
        </section>

        <section className="section" id="how" aria-labelledby="how-h">
          <div className="container">
            <Reveal className="section-head">
              <span className="kicker">How it works</span>
              <h2 id="how-h">Four steps from counter to settlement</h2>
            </Reveal>
            <ol className="steps">
              {[
                { icon: <IconRentals />, t: 'Create rental', d: 'Pick the item and dates. The deposit comes from the item settings.', tag: 'Shop' },
                { icon: <IconCamera />, t: 'Document condition', d: 'Renter approves the PayPal hold. Staff shoot each angle; AI records existing marks; renter signs off.', tag: 'PayPal + AI' },
                { icon: <IconScan />, t: 'Compare with AI', d: 'Same angles at return. New damage is boxed and priced from the shop list. Old marks are ignored.', tag: 'AI' },
                { icon: <IconCard />, t: 'Settle through PayPal', d: 'Owner approves. PayPal captures the deduction and releases the rest, or voids the hold.', tag: 'PayPal' },
              ].map((s, i) => (
                <Reveal as="li" className="step" key={s.t} delay={i * 0.1}>
                  <div className="step-num">{i + 1}</div>
                  <div className="step-icon">{s.icon}</div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                  <span className="step-tag">{s.tag}</span>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <section className="section section-dark" aria-labelledby="ai-h">
          <div className="container">
            <Reveal className="section-head on-dark">
              <span className="kicker">AI inspection</span>
              <h2 id="ai-h">See exactly what changed</h2>
              <p className="lead-sm">Existing marks from the signed baseline stay grey. Potential new damage is boxed, rated and scored for confidence. Anything uncertain goes to a person.</p>
            </Reveal>
            <div className="showcase">
              <ComparePanel angle="Lens" beforeSrc={demoBefore} afterSrc={demoAfter} existing={demoExisting} found={demoFound} ignored={['Scuff on left grip']} />
              <aside className="showcase-side">
                <h3>Proposed settlement</h3>
                <dl className="sum">
                  <div>
                    <dt>Crack on lens ring · moderate</dt>
                    <dd>$45.00</dd>
                  </div>
                  <div className="is-muted">
                    <dt>Chip on lower body · 54% · review</dt>
                    <dd>not charged</dd>
                  </div>
                  <div className="sum-total">
                    <dt>Capture</dt>
                    <dd>$45.00</dd>
                  </div>
                  <div className="sum-release">
                    <dt>Released to renter</dt>
                    <dd>$255.00</dd>
                  </div>
                </dl>
                <DepositGauge depositCents={30000} capturedCents={4500} size={200} />
                <p className="fine">Illustration with sample values. In the app every number comes from your photos, the shop's price list and PayPal.</p>
              </aside>
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="pp-h">
          <div className="container">
            <Reveal className="section-head">
              <span className="kicker">PayPal deposit lifecycle</span>
              <h2 id="pp-h">The deposit never moves until a person says so</h2>
              <p className="lead-sm">Handback uses PayPal's authorize-and-capture flow. This build runs against the PayPal sandbox: no real money moves.</p>
            </Reveal>
            <div className="lifecycle">
              {[
                { t: 'Authorize', d: 'Renter approves a hold for the deposit. $0 is charged.', api: 'Orders v2 · intent AUTHORIZE', tone: 'info' },
                { t: 'Approve deduction', d: 'Owner reviews AI findings and edits amounts. Total is capped at the hold.', api: 'Handback · owner approval', tone: 'warn' },
                { t: 'Capture', d: 'Only the approved amount is captured, with an idempotency key.', api: 'Payments v2 · capture', tone: 'bad' },
                { t: 'Release', d: 'The rest of the hold is released in the same call, or the hold is voided.', api: 'final_capture: true · void', tone: 'good' },
                { t: 'Refund', d: 'If an appeal is upheld, part of the capture is refunded.', api: 'Payments v2 · refund', tone: 'accent' },
              ].map((s, i) => (
                <Reveal className={`life tone-${s.tone}`} key={s.t} delay={i * 0.08}>
                  <span className="life-num">{String(i + 1).padStart(2, '0')}</span>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                  <code className="mono">{s.api}</code>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="section section-alt" id="security" aria-labelledby="trust-h">
          <div className="container trust">
            <Reveal className="section-head left">
              <span className="kicker">Trust and security</span>
              <h2 id="trust-h">Evidence first. Humans decide.</h2>
              <p className="lead-sm">AI findings are observations to support a decision, not proof. Handback is designed so that a wrong guess can't charge anyone.</p>
            </Reveal>
            <ul className="trust-list">
              {[
                { icon: <IconCamera />, t: 'Evidence-based inspections', d: 'Every finding links to a box on a real photo, next to the pick-up photo it was compared against.' },
                { icon: <IconUser />, t: 'Human-approved deductions', d: 'The AI has no payment access. Only the settlement service calls PayPal, after the owner approves.' },
                { icon: <IconShield />, t: 'Money rules in code', d: 'Amounts in integer cents, capped at the hold, one capture per rental, retries reuse the same PayPal request id.' },
                { icon: <IconReceipt />, t: 'Transparent payment history', d: 'Authorization, capture, release and refund are recorded with their PayPal IDs on an activity log.' },
              ].map((t) => (
                <Reveal as="li" key={t.t}>
                  <span className="trust-icon">{t.icon}</span>
                  <div>
                    <h3>{t.t}</h3>
                    <p>{t.d}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        <section className="cta">
          <Reveal className="container cta-inner" y={24}>
            <h2>Make every rental return a fair one.</h2>
            <p>Run the full flow locally against the PayPal sandbox in a few minutes.</p>
            <Link to="/app" className="btn btn-accent btn-lg">
              Get started <IconArrowRight size={18} />
            </Link>
          </Reveal>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <div>
            <a href="/" className="brand">
              <IconLogo size={24} /> <span>Handback</span>
            </a>
            <p className="muted small">Rent with confidence. Return with proof.</p>
          </div>
          <nav className="footer-cols" aria-label="Footer">
            <div>
              <h4>Product</h4>
              <button onClick={() => scrollTo('product')}>Overview</button>
              <button onClick={() => scrollTo('how')}>How it works</button>
              <button onClick={() => scrollTo('features')}>Features</button>
            </div>
            <div>
              <h4>App</h4>
              <Link to="/app">Dashboard</Link>
              <Link to="/app/rentals">Rentals</Link>
              <Link to="/app/payments">Payments</Link>
            </div>
            <div>
              <h4>Trust</h4>
              <button onClick={() => scrollTo('security')}>Security</button>
              <span className="muted small">PayPal sandbox build</span>
            </div>
          </nav>
        </div>
        <div className="container footer-base muted small">Built for the PayPal AI Hackathon 2026. Sandbox only; no real payments.</div>
      </footer>
    </div>
  );
}
