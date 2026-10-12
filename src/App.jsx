import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, Check, ChevronDown,
  CircleHelp, Copy, ExternalLink, Eye, Globe, LogOut, Plus, RefreshCw,
  ShieldCheck, Trash2, Users, X
} from "lucide-react";
import {
  addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot,
  orderBy, query, serverTimestamp, where
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { auth, db, firebaseConfigForTracker, firebaseConfigured } from "./config/Firebase";

const dateRanges = [
  { label: "Last 7 days", value: "7" },
  { label: "Last 30 days", value: "30" },
  { label: "All time", value: "all" },
];

function formatNumber(n) {
  return new Intl.NumberFormat().format(n || 0);
}

function hostFromUrl(input) {
  let value = input.trim();
  if (!value) throw new Error("Enter the website domain.");
  if (!/^https?:\/\//i.test(value)) value = "https://" + value;
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Use an HTTP or HTTPS website.");
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

function useAuthUser() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(firebaseConfigured);
  useEffect(() => {
    if (!firebaseConfigured || !auth) return;
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setChecking(false);
    });
  }, []);
  return { user, checking };
}

function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <Brand />
        <div className="eyebrow">PRIVATE WEBSITE ANALYTICS</div>
        <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="muted">Track traffic across the websites you build.</p>
        <form onSubmit={submit} className="form-stack">
          <label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} required /></label>
          {error && <div className="alert error">{error}</div>}
          <button className="button primary full" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
        </form>
        <button className="text-button auth-toggle" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>
          {mode === "login" ? "New to Castiel? Create an account" : "Already have an account? Sign in"}
        </button>
        <div className="auth-note"><ShieldCheck size={16} /> Your analytics dashboard is private.</div>
      </div>
    </main>
  );
}

function Brand({ small = false }) {
  return <div className={`brand ${small ? "brand-small" : ""}`}>
    <div className="brand-mark"><BarChart3 size={small ? 19 : 23} /></div>
    <div><strong>Castiel</strong><span>ANALYTICS</span></div>
  </div>;
}

function SetupNotice() {
  return <main className="setup-page">
    <div className="setup-card">
      <Brand />
      <div className="eyebrow">ONE-TIME SETUP</div>
      <h1>Connect your Firebase project</h1>
      <p className="muted">The app is ready, but it needs your Firebase web-app settings before login and real tracking can work.</p>
      <ol className="setup-list">
        <li>Open <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">Firebase Console <ExternalLink size={13} /></a> and create or select a project.</li>
        <li>In Project settings → General, add a Web app and copy its config values.</li>
        <li>In your project folder, copy <code>.env.example</code> to <code>.env</code>, then fill in the values.</li>
        <li>Enable Authentication → Sign-in method → Email/Password.</li>
        <li>Create a Cloud Firestore database and publish the included <code>firestore.rules</code>.</li>
      </ol>
      <div className="alert warning">Do not put Firebase Admin service-account keys in this frontend. The web config and API key are designed to be public; Firestore rules protect your data.</div>
      <p className="muted small">After adding the settings, restart Vite with <code>npm run dev</code>, or redeploy on Render.</p>
    </div>
  </main>;
}

function friendlyError(err) {
  const code = err?.code || "";
  const messages = {
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/weak-password": "Use a password with at least 6 characters.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/too-many-requests": "Too many attempts. Wait a little and try again.",
    "permission-denied": "Firestore denied this action. Check that the included security rules are published.",
    "failed-precondition": "Firestore needs an index or database setup. Check the Firebase Console.",
  };
  return messages[code] || err?.message || "Something went wrong. Please try again.";
}

function App() {
  const { user, checking } = useAuthUser();
  const [sites, setSites] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [range, setRange] = useState("7");
  const [events, setEvents] = useState([]);
  const [loadingSites, setLoadingSites] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoadingSites(true);
    const q = query(collection(db, "sites"), where("ownerId", "==", user.uid));
    return onSnapshot(q, snap => {
      const next = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setSites(next);
      setSelectedId(current => next.some(s => s.id === current) ? current : (next[0]?.id || ""));
      setLoadingSites(false);
    }, err => {
      setError(friendlyError(err));
      setLoadingSites(false);
    });
  }, [user]);

  const selectedSite = sites.find(s => s.id === selectedId) || null;

  useEffect(() => {
    if (!user || !selectedId) {
      setEvents([]);
      return;
    }
    setLoadingEvents(true);
    setError("");
    // Query on the single indexed field, then filter/sort in the browser.
    const q = query(collection(db, "analyticsEvents"), where("siteId", "==", selectedId), limit(1000));
    return onSnapshot(q, snap => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoadingEvents(false);
    }, err => {
      setError(friendlyError(err));
      setLoadingEvents(false);
    });
  }, [user, selectedId]);

  const filteredEvents = useMemo(() => {
    const now = Date.now();
    const start = range === "all" ? 0 : now - Number(range) * 24 * 60 * 60 * 1000;
    return events.filter(e => {
      const date = e.createdAt?.toDate ? e.createdAt.toDate().getTime() : (e.clientTime || 0);
      return date >= start && date <= now + 60_000;
    });
  }, [events, range]);

  const stats = useMemo(() => {
    const visitorSet = new Set(filteredEvents.map(e => e.visitorId).filter(Boolean));
    const days = {};
    filteredEvents.forEach(e => {
      const date = e.createdAt?.toDate ? e.createdAt.toDate() : new Date(e.clientTime || 0);
      if (Number.isNaN(date.getTime())) return;
      const key = date.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
      days[key] = (days[key] || 0) + 1;
    });
    const chartData = Object.entries(days).map(([day, views]) => ({ day, views }));
    return { visitors: visitorSet.size, pageViews: filteredEvents.length, chartData };
  }, [filteredEvents]);

  async function addSite({ name, domain }) {
    setError("");
    setNotice("");
    try {
      const cleanDomain = hostFromUrl(domain);
      const existing = sites.find(s => s.domain === cleanDomain);
      if (existing) throw new Error("You have already registered this domain.");
      const ref = await addDoc(collection(db, "sites"), {
        ownerId: user.uid,
        name: name.trim(),
        domain: cleanDomain,
        enabled: true,
        createdAt: serverTimestamp(),
      });
      setSelectedId(ref.id);
      setShowAdd(false);
      setNotice("Website added. Copy its tracking snippet to start collecting visits.");
    } catch (err) {
      setError(friendlyError(err));
      throw err;
    }
  }

  async function removeSite(site) {
    const yes = window.confirm(`Delete "${site.name}" from your dashboard? Existing event records will remain in Firestore.`);
    if (!yes) return;
    try {
      await deleteDoc(doc(db, "sites", site.id));
      if (selectedId === site.id) setSelectedId("");
      setNotice("Website removed. Its old event records were not deleted.");
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  if (!firebaseConfigured) return <SetupNotice />;
  if (checking) return <div className="loading-screen"><div className="spinner" />Loading Castiel Analytics…</div>;
  if (!user) return <AuthScreen />;

  return <div className="app-shell">
    <aside className="sidebar">
      <Brand />
      <div className="side-label">WORKSPACE</div>
      <button className="side-link active"><BarChart3 size={18} /> Overview</button>
      <button className="side-link" onClick={() => setShowInstall(true)}><CircleHelp size={18} /> Install tracking</button>
      <div className="side-bottom">
        <div className="user-chip"><div className="avatar">{(user.email || "C").slice(0, 1).toUpperCase()}</div><div className="user-info"><strong>{user.email}</strong><span>Owner account</span></div></div>
        <button className="side-link" onClick={() => signOut(auth)}><LogOut size={18} /> Sign out</button>
      </div>
    </aside>

    <main className="main-content">
      <header className="topbar">
        <div><div className="eyebrow">YOUR WORKSPACE</div><h1>Website overview</h1></div>
        <button className="button primary" onClick={() => setShowAdd(true)}><Plus size={17} /> Add website</button>
      </header>

      {notice && <div className="alert success"><Check size={17} /> <span>{notice}</span><button className="icon-button" onClick={() => setNotice("")}><X size={16} /></button></div>}
      {error && <div className="alert error"><span>{error}</span><button className="icon-button" onClick={() => setError("")}><X size={16} /></button></div>}

      <section className="site-toolbar">
        <div className="site-select-wrap">
          <label htmlFor="site-select">Selected website</label>
          <div className="select-with-icon"><Globe size={18} /><select id="site-select" value={selectedId} onChange={e => setSelectedId(e.target.value)} disabled={!sites.length}><option value="">Choose a website</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name} · {s.domain}</option>)}</select><ChevronDown size={16} /></div>
        </div>
        <div className="range-select">
          <label htmlFor="range-select">Date range</label>
          <div className="select-with-icon"><select id="range-select" value={range} onChange={e => setRange(e.target.value)}>{dateRanges.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select><ChevronDown size={16} /></div>
        </div>
        {selectedSite && <button className="button secondary" onClick={() => setShowInstall(true)}><Copy size={16} /> Tracking code</button>}
      </section>

      {loadingSites ? <div className="empty-state"><div className="spinner" />Loading your websites…</div> : !sites.length ? <div className="empty-state large-empty">
        <div className="empty-icon"><Globe size={28} /></div><h2>Your first website starts here</h2>
        <p>Add a website, install its tracking snippet, and come back to view real visits and page views.</p>
        <button className="button primary" onClick={() => setShowAdd(true)}><Plus size={17} /> Add your first website</button>
      </div> : !selectedSite ? <div className="empty-state">Choose a website to see its reports.</div> : <>
        <div className="selected-site-line"><div className="site-favicon"><Globe size={17} /></div><div><strong>{selectedSite.name}</strong><a href={`https://${selectedSite.domain}`} target="_blank" rel="noreferrer">{selectedSite.domain} <ExternalLink size={12} /></a></div><span className={`status-pill ${selectedSite.enabled ? "online" : "offline"}`}><span />{selectedSite.enabled ? "Tracking enabled" : "Tracking paused"}</span><button className="icon-button danger-icon" title="Remove website" onClick={() => removeSite(selectedSite)}><Trash2 size={17} /></button></div>

        <section className="stats-grid">
          <StatCard icon={<Users size={18} />} title="Unique browsers" value={formatNumber(stats.visitors)} helper="Estimated from browser IDs" />
          <StatCard icon={<Eye size={18} />} title="Page views" value={formatNumber(stats.pageViews)} helper={range === "all" ? "All recorded time" : `Last ${range} days`} />
          <StatCard icon={<Activity size={18} />} title="Tracking status" value={selectedSite.enabled ? "Active" : "Paused"} helper="Events update in real time" />
        </section>

        <section className="panel chart-panel">
          <div className="panel-heading"><div><h2>Page views</h2><p className="muted">Views recorded in the selected period</p></div><div className="live-label"><span /> Live updates</div></div>
          {loadingEvents ? <div className="chart-empty"><div className="spinner" />Loading events…</div> : stats.chartData.length ? <ViewsChart data={stats.chartData} /> : <div className="chart-empty"><div className="empty-icon"><BarChart3 size={25} /></div><strong>No page views yet</strong><span>Add the tracking snippet to your website and visit it once to test.</span></div>}
        </section>

        <section className="panel">
          <div className="panel-heading"><div><h2>Getting started</h2><p className="muted">Follow these steps to see your first real visit.</p></div></div>
          <div className="steps-grid">
            <Step number="01" title="Copy your tracking code" text="Use the button above to get a snippet unique to this website." />
            <Step number="02" title="Add it to your site" text="Place it in the HTML head, or in your shared React layout." />
            <Step number="03" title="Visit your website" text="Open the deployed website in a browser. Your first page view should appear shortly." />
          </div>
        </section>
      </>}
      <footer className="footer"><span>© {new Date().getFullYear()} Castiel Analytics</span><span>Built for independent website creators</span></footer>
    </main>

    {showAdd && <AddSiteModal onClose={() => setShowAdd(false)} onAdd={addSite} />}
    {showInstall && selectedSite && <TrackingModal site={selectedSite} config={firebaseConfigForTracker} onClose={() => setShowInstall(false)} />}
    {showInstall && !selectedSite && <InfoModal onClose={() => setShowInstall(false)} />}
  </div>;
}

function StatCard({ icon, title, value, helper }) {
  return <div className="stat-card"><div className="stat-top"><span className="stat-icon">{icon}</span><span className="stat-caption">{title}</span></div><div className="stat-value">{value}</div><div className="stat-helper">{helper}</div></div>;
}

function Step({ number, title, text }) {
  return <div className="step"><span className="step-number">{number}</span><div><strong>{title}</strong><p>{text}</p></div></div>;
}

function ViewsChart({ data }) {
  // Lightweight responsive SVG chart: avoids requiring a separate charting service.
  const width = 720, height = 230, padX = 30, padY = 24;
  const max = Math.max(1, ...data.map(d => d.views));
  const points = data.map((d, i) => {
    const x = data.length === 1 ? width / 2 : padX + i * ((width - 2 * padX) / (data.length - 1));
    const y = height - padY - (d.views / max) * (height - 2 * padY);
    return { ...d, x, y };
  });
  const polyline = points.map(p => `${p.x},${p.y}`).join(" ");
  return <div className="svg-chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Page views chart" className="svg-chart" preserveAspectRatio="none">
    {[0, 1, 2, 3].map(i => <line key={i} x1={padX} x2={width - padX} y1={padY + i * ((height - 2 * padY) / 3)} y2={padY + i * ((height - 2 * padY) / 3)} stroke="currentColor" opacity=".1" strokeDasharray="4 5" />)}
    <polyline points={polyline} fill="none" stroke="#168b72" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    {points.map((p, i) => <g key={i}><circle cx={p.x} cy={p.y} r="4.5" fill="#168b72" stroke="white" strokeWidth="2" /><title>{p.day}: {p.views} views</title></g>)}
  </svg><div className="chart-labels">{points.map((p, i) => <span key={i}>{p.day}</span>)}</div></div>;
}

function AddSiteModal({ onClose, onAdd }) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try { await onAdd({ name, domain }); }
    catch (err) { setError(err.message || "Could not add website."); }
    finally { setBusy(false); }
  }
  return <Modal onClose={onClose} title="Add a website" subtitle="Register a site to create its tracking code.">
    <form className="form-stack" onSubmit={submit}>
      <label>Website name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mama Njeri Restaurant" required maxLength={70} /></label>
      <label>Website domain<input value={domain} onChange={e => setDomain(e.target.value)} placeholder="example.com" required /></label>
      <p className="field-hint">Enter the domain only. You can include https://; paths are ignored. Use the real domain visitors will open.</p>
      {error && <div className="alert error">{error}</div>}
      <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? "Adding…" : "Add website"}</button></div>
    </form>
  </Modal>;
}

function TrackingModal({ site, config, onClose }) {
  const [copied, setCopied] = useState(false);
  const snippet = `<script type="module" src="https://YOUR-CASTIEL-APP.onrender.com/track.js" data-site-id="${site.id}" data-api-key="${config.apiKey}" data-auth-domain="${config.authDomain}" data-project-id="${config.projectId}" data-app-id="${config.appId}"></script>`;
  async function copy() {
    try { await navigator.clipboard.writeText(snippet); setCopied(true); }
    catch { setCopied(false); }
  }
  return <Modal onClose={onClose} title="Install tracking" subtitle={`Tracking code for ${site.name}`}>
    <div className="install-instructions">
      <div className="install-step"><span>1</span><p>Replace <code>YOUR-CASTIEL-APP.onrender.com</code> with your deployed Render domain.</p></div>
      <div className="install-step"><span>2</span><p>Paste this snippet inside the <code>&lt;head&gt;</code> of the website you want to track.</p></div>
      <div className="install-step"><span>3</span><p>Deploy that website, then open it to create a test page view.</p></div>
    </div>
    <pre className="code-snippet"><code>{snippet}</code></pre>
    <div className="alert warning small">The Firebase web config is public by design. Keep Firestore rules published and never expose Admin SDK credentials.</div>
    <div className="modal-actions"><button className="button secondary" onClick={onClose}>Close</button><button className="button primary" onClick={copy}><Copy size={16} /> {copied ? "Copied" : "Copy snippet"}</button></div>
  </Modal>;
}

function InfoModal({ onClose }) {
  return <Modal onClose={onClose} title="Install tracking" subtitle="First, add a website to your workspace."><p className="muted">After registering a website, select it to generate a tracking snippet.</p><div className="modal-actions"><button className="button primary" onClick={onClose}>Got it</button></div></Modal>;
}

function Modal({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div className="modal-card" role="dialog" aria-modal="true" aria-label={title}>
    <div className="modal-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
    {children}
  </div></div>;
}

export default App;
