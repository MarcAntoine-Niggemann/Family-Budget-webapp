export interface CspViolationRecord {
  timestamp: number;
  directive: string;
  blockedURI: string;
  sourceFile?: string;
}

export interface AuthTraceEntry {
  timestamp: number;
  stage: string;
}

export interface AuthDiagnosticsSnapshot {
  cspViolations: CspViolationRecord[];
  runtimeErrors: string[];
  trace: AuthTraceEntry[];
  lastUpdated: number;
}

const MAX_ITEMS = 25;

let cspViolations: CspViolationRecord[] = [];
let runtimeErrors: string[] = [];
let trace: AuthTraceEntry[] = [];
let lastUpdated = Date.now();
const listeners = new Set<() => void>();
let listenersAttached = false;

function notify(): void {
  lastUpdated = Date.now();
  listeners.forEach(fn => {
    try {
      fn();
    } catch {
      // Ignore subscriber errors
    }
  });
}

function attachGlobalListeners(): void {
  if (listenersAttached || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  listenersAttached = true;

  document.addEventListener('securitypolicyviolation', (ev: SecurityPolicyViolationEvent) => {
    const directive = ev.effectiveDirective || ev.violatedDirective || 'unknown';
    const rawUri = ev.blockedURI || 'inline';
    // Strip query parameters/fragments so no sensitive tokens ever enter UI diagnostics
    let cleanUri = rawUri;
    try {
      if (rawUri.startsWith('http://') || rawUri.startsWith('https://')) {
        const u = new URL(rawUri);
        cleanUri = `${u.origin}${u.pathname}`;
      }
    } catch {
      // Keep original safe string
    }

    const record: CspViolationRecord = {
      timestamp: Date.now(),
      directive,
      blockedURI: cleanUri,
      sourceFile: ev.sourceFile ? ev.sourceFile.split('?')[0] : undefined
    };

    const duplicate = cspViolations.some(
      v => v.directive === record.directive && v.blockedURI === record.blockedURI && Date.now() - v.timestamp < 5000
    );
    if (!duplicate) {
      cspViolations = [...cspViolations.slice(-(MAX_ITEMS - 1)), record];
      trace = [
        ...trace.slice(-(MAX_ITEMS - 1)),
        { timestamp: Date.now(), stage: `CSP blocked [${record.directive}]: ${record.blockedURI}` }
      ];
      notify();
    }
  });

  window.addEventListener('error', (ev: ErrorEvent) => {
    const msg = ev.message || (ev.error && ev.error.message) || '';
    if (!msg) return;
    // Ignore benign ResizeObserver warnings or Vite HMR noise
    if (msg.includes('ResizeObserver')) return;
    const formatted = `${msg}${ev.filename ? ` (${ev.filename.split('?')[0].split('/').pop()}:${ev.lineno})` : ''}`;
    if (!runtimeErrors.includes(formatted)) {
      runtimeErrors = [...runtimeErrors.slice(-(MAX_ITEMS - 1)), formatted];
      notify();
    }
  });

  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    const reason = ev.reason;
    const msg =
      typeof reason === 'string'
        ? reason
        : reason?.message || reason?.code || '';
    if (!msg) return;
    const formatted = reason?.code ? `[${reason.code}] ${msg}` : msg;
    if (!runtimeErrors.includes(formatted)) {
      runtimeErrors = [...runtimeErrors.slice(-(MAX_ITEMS - 1)), formatted];
      notify();
    }
  });
}

attachGlobalListeners();

export function initAuthDiagnostics(): void {
  attachGlobalListeners();
}

export function clearAuthTrace(initialStage?: string): void {
  attachGlobalListeners();
  cspViolations = [];
  runtimeErrors = [];
  trace = initialStage ? [{ timestamp: Date.now(), stage: initialStage }] : [];
  notify();
}

export function recordAuthTrace(stage: string): void {
  attachGlobalListeners();
  trace = [...trace.slice(-(MAX_ITEMS - 1)), { timestamp: Date.now(), stage }];
  notify();
}

export function getAuthDiagnosticsSnapshot(): AuthDiagnosticsSnapshot {
  return {
    cspViolations: [...cspViolations],
    runtimeErrors: [...runtimeErrors],
    trace: [...trace],
    lastUpdated
  };
}

export function subscribeAuthDiagnostics(cb: () => void): () => void {
  attachGlobalListeners();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function formatCspSummary(): string | null {
  if (cspViolations.length === 0) return null;
  const lines = cspViolations.map(v => `• [${v.directive}] ${v.blockedURI}`);
  return `Blocage CSP détecté par le navigateur :\n${lines.join('\n')}`;
}

export function formatDiagnosticsSummary(): string {
  const parts: string[] = [];
  if (cspViolations.length > 0) {
    parts.push('CSP violations:\n' + cspViolations.map(v => `  [${v.directive}] ${v.blockedURI}`).join('\n'));
  }
  if (runtimeErrors.length > 0) {
    parts.push('Runtime errors:\n' + runtimeErrors.map(e => `  ${e}`).join('\n'));
  }
  if (trace.length > 0) {
    const t0 = trace[0].timestamp;
    parts.push(
      'Connection trace:\n' +
        trace.map(t => `  +${((t.timestamp - t0) / 1000).toFixed(2)}s ${t.stage}`).join('\n')
    );
  }
  return parts.join('\n\n');
}
