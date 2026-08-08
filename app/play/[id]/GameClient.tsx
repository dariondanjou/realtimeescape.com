'use client';

/**
 * Burn Window game client.
 *
 * Owns the Colyseus connection and the HUD; the 3D world lives in world.ts. The client renders
 * and requests — every decision that matters (puzzle validation, zone gating, the burn verdict)
 * happens on the server, and the panels here only display what the server chose to send this
 * player. See docs/NETWORK_PROTOCOL.md.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Client, Room } from 'colyseus.js';
import { createWorld, INTERACTABLES, type World, type ZoneId } from './world';

type Phase = 'connecting' | 'lobby' | 'briefing' | 'active' | 'escaped' | 'failed' | 'debrief' | 'error';

type PuzzlePublic = {
  solved: string[];
  objective: string;
  act: number;
  breakers: boolean[];
  busLocked: boolean;
  pressure: number;
  tokenSocketed: boolean;
  startProgress: string[];
  startLocked: boolean;
  marks: Record<string, boolean>;
  valvesOpen: string[];
  keysHeld: Record<string, string>;
  keysSocketed: string[];
  inventory: string[];
  restraintsReleased: Record<string, boolean>;
};

type CockpitView = {
  stage: {
    index: number;
    label: string;
    armingOrder: string[];
    settings: Record<string, { thrustPct: number; gimbalDeg: number }>;
    durationMs: number;
  };
  stagesTotal: number;
  readiness: Record<string, { powered: boolean; interlockCleared: boolean; armed: boolean; dialsTouched: boolean }>;
};

type StationView = {
  station: string;
  name: string;
  powered: boolean;
  interlockCleared: boolean;
  armed: boolean;
  thrustPct: number;
  gimbalDeg: number;
};

type ChatMsg = { from: string; text: string; at: number };
type SessionResult = {
  result: string; timeRemainingMs: number; hintsUsed: number; attempts: number; players: number;
};

const LABELS = Object.fromEntries(INTERACTABLES.map((i) => [i.id, i.label]));

export default function GameClient({
  bookingId, serverUrl, displayName,
}: {
  bookingId: string;
  serverUrl: string;
  displayName: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef<Room | null>(null);
  const worldRef = useRef<World | null>(null);
  const zoneRef = useRef<ZoneId>('Z1');
  const readWaiters = useRef<Map<string, (data: unknown) => void>>(new Map());
  const panelOpenRef = useRef(false);
  const knownRemotes = useRef<Set<string>>(new Set());

  const [phase, setPhase] = useState<Phase>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<{ id: string; name: string; ready: boolean }[]>([]);
  const [clockMs, setClockMs] = useState(60 * 60 * 1000);
  const [objective, setObjective] = useState('');
  const [act, setAct] = useState(1);
  const [pz, setPz] = useState<PuzzlePublic | null>(null);
  const [openDoors, setOpenDoors] = useState<string[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [panel, setPanel] = useState<string | null>(null);
  const [panelMsg, setPanelMsg] = useState<string | null>(null);
  const [cassLines, setCassLines] = useState<{ text: string; at: number }[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [cockpit, setCockpit] = useState<CockpitView | null>(null);
  const [station, setStation] = useState<StationView | null>(null);
  const [burnWindowOpen, setBurnWindowOpen] = useState(false);
  const [burnAttempt, setBurnAttempt] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [myZone, setMyZone] = useState<ZoneId>('Z1');

  const send = useCallback((type: string, payload?: unknown) => {
    roomRef.current?.send(type, payload);
  }, []);

  const interact = useCallback((puzzleId: string, action: string, payload?: unknown) => {
    setPanelMsg(null);
    send('interact', { puzzleId, action, payload });
  }, [send]);

  const read = useCallback((what: string): Promise<unknown> => {
    return new Promise((resolve) => {
      readWaiters.current.set(what, resolve);
      send('read', { what });
      setTimeout(() => {
        if (readWaiters.current.has(what)) {
          readWaiters.current.delete(what);
          resolve({ error: 'No reply from the ship.' });
        }
      }, 4000);
    });
  }, [send]);

  /* ---------------- connection + world ---------------- */

  useEffect(() => {
    let disposed = false;
    let moveTimer: ReturnType<typeof setInterval> | null = null;

    (async () => {
      try {
        const client = new Client(serverUrl);
        const room = await client.joinOrCreate('burn_window', {
          bookingId,
          displayName,
          seatId: `seat-${displayName}-${Math.random().toString(36).slice(2, 7)}`,
        });
        if (disposed) { void room.leave(); return; }
        roomRef.current = room;

        room.onStateChange((s: any) => {
          setPhase((prev) =>
            (['lobby', 'briefing', 'active', 'escaped', 'failed', 'debrief'].includes(s.phase)
              ? s.phase : prev) as Phase);
          setClockMs(s.clockMsRemaining);
          setObjective(s.objective);
          setAct(s.act);
          setBurnWindowOpen(Boolean(s.burn?.windowOpen));
          setBurnAttempt(s.burn?.attempt ?? 0);
          setStageIndex(s.burn?.stageIndex ?? 0);
          try { setPz(JSON.parse(s.puzzleJson || '{}')); } catch { /* partial state */ }

          const doors: string[] = [];
          s.openDoors?.forEach((d: string) => doors.push(d));
          setOpenDoors(doors);

          const ps: { id: string; name: string; ready: boolean }[] = [];
          const present = new Set<string>();
          s.players?.forEach((p: any, id: string) => {
            ps.push({ id, name: p.displayName, ready: p.ready });
            present.add(id);
            if (id !== room.sessionId && worldRef.current) {
              worldRef.current.upsertRemote(id, p.displayName, p.x, p.y, p.z, p.ry);
            }
          });
          // Departed players lose their avatar.
          for (const known of knownRemotes.current) {
            if (!present.has(known)) worldRef.current?.removeRemote(known);
          }
          knownRemotes.current = present;
          setPlayers(ps);
        });

        room.onMessage('read.result', (m: { what: string; data: unknown }) => {
          const w = readWaiters.current.get(m.what);
          if (w) { readWaiters.current.delete(m.what); w(m.data); }
        });
        room.onMessage('interact.result', (m: { ok: boolean; message?: string | null }) => {
          if (m.message) setPanelMsg(m.message);
        });
        room.onMessage('cass', (m: { text: string }) => {
          setCassLines((l) => [...l.slice(-3), { text: m.text, at: Date.now() }]);
          try {
            const u = new SpeechSynthesisUtterance(m.text.replace(/^CASS:\s*/, ''));
            u.rate = 1.02; u.pitch = 1.1;
            window.speechSynthesis?.speak(u);
          } catch { /* speech is a garnish, never a dependency */ }
        });
        room.onMessage('chat', (m: ChatMsg) => setChat((c) => [...c.slice(-30), m]));
        room.onMessage('puzzle.solved', () => {});
        room.onMessage('cockpit.view', (m: CockpitView) => setCockpit(m));
        room.onMessage('station.view', (m: StationView) => setStation(m));
        room.onMessage('burn.result', () => {});
        room.onMessage('session.result', (m: SessionResult) => setResult(m));
        room.onMessage('welcome', () => {});
        room.onMessage('hint', () => {});
        room.onMessage('error', (m: { message: string }) => setPanelMsg(m.message));

        room.onLeave(() => { if (!disposed) setError('Connection to the ship was lost. Reload to reclaim your seat.'); });

        // World
        if (canvasRef.current) {
          const world = createWorld(canvasRef.current, {
            onInteract: (id) => {
              if (!panelOpenRef.current) {
                setPanel(id);
                setPanelMsg(null);
                document.exitPointerLock?.();
              }
            },
            onHover: (id) => setHover(id),
            onZoneChange: (z) => { zoneRef.current = z; setMyZone(z); },
            onLockChange: (l) => setLocked(l),
          });
          worldRef.current = world;

          moveTimer = setInterval(() => {
            const t = world.getTransform();
            room.send('move', { ...t, zone: zoneRef.current, locomotion: 'walk' });
          }, 100);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reach the game server.');
        setPhase('error');
      }
    })();

    return () => {
      disposed = true;
      if (moveTimer) clearInterval(moveTimer);
      void roomRef.current?.leave();
      worldRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, serverUrl, displayName]);

  /* doors follow server state */
  useEffect(() => {
    const w = worldRef.current;
    if (!w) return;
    for (const d of ['d_lounge', 'd_flightdeck', 'd_bays'] as const) {
      w.setDoorOpen(d, openDoors.includes(d));
    }
  }, [openDoors]);

  panelOpenRef.current = panel !== null;

  /* keyboard: Escape closes panel, Enter opens chat, H hints */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setPanel(null); setChatOpen(false); }
      if (e.key === 'Enter' && !chatOpen && !panel) { setChatOpen(true); e.preventDefault(); }
      if ((e.key === 'h' || e.key === 'H') && !chatOpen && !panel) send('hint.request');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chatOpen, panel, send]);

  /* ---------------- render ---------------- */

  if (error) {
    return (
      <Shell><div className="panel panel-accent" style={{ maxWidth: 480 }}>
        <h2 style={{ fontSize: 20, marginBottom: 10 }}>Signal lost</h2>
        <p className="small">{error}</p>
      </div></Shell>
    );
  }

  return (
    /* z-index above the site header (50) and the feedback widget (80): the ship is the page. */
    <div style={{ position: 'fixed', inset: 0, background: '#0b1114', zIndex: 90 }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', outline: 'none' }}
        onClick={() => { if (!panel && phase === 'active') worldRef.current?.requestPointerLock(); }}
      />

      {/* ---- lobby / briefing overlays ---- */}
      {phase === 'connecting' && <Center><p className="mono">Boarding CSV Meridian…</p></Center>}

      {phase === 'lobby' && (
        <Center>
          <div className="panel" style={{ width: 380 }}>
            <span className="eyebrow">Pre-flight</span>
            <h2 style={{ fontSize: 22, margin: '10px 0 14px' }}>Your group</h2>
            <div className="stack" style={{ marginBottom: 18 }}>
              {players.map((p) => (
                <div key={p.id} className="spread small">
                  <span>{p.name}</span>
                  <span className={`badge ${p.ready ? 'badge-live' : ''}`}>{p.ready ? 'ready' : 'not ready'}</span>
                </div>
              ))}
            </div>
            <button type="button" className="btn btn-primary btn-block" onClick={() => send('ready')}>
              I&rsquo;m ready
            </button>
            <p className="tiny" style={{ marginTop: 10 }}>
              The incident begins when everyone is ready. Headphones on.
            </p>
          </div>
        </Center>
      )}

      {phase === 'briefing' && (
        <Center>
          <div style={{ maxWidth: 560, textAlign: 'center' }}>
            <p className="eyebrow" style={{ marginBottom: 14 }}>Anterra Orbital · Flight AO-114</p>
            <p style={{ fontSize: 20, lineHeight: 1.6 }}>
              {cassLines[cassLines.length - 1]?.text ?? '…'}
            </p>
          </div>
        </Center>
      )}

      {/* ---- active HUD ---- */}
      {(phase === 'active' || phase === 'escaped' || phase === 'failed' || phase === 'debrief') && (
        <>
          {/* top bar */}
          <div style={hudBar}>
            <div className="mono" style={{ fontSize: 13, color: 'var(--text-dim)' }}>ACT {['I', 'II', 'III', 'IV'][act - 1] ?? act}</div>
            <div className="mono" style={{
              fontSize: 26, letterSpacing: '0.06em',
              color: clockMs < 10 * 60000 ? '#ff9d7a' : 'var(--near-white)',
            }}>
              {fmtClock(clockMs)}
            </div>
            <div className="small" style={{ maxWidth: 380, textAlign: 'right', color: 'var(--text-dim)' }}>{objective}</div>
          </div>

          {/* crosshair + interact prompt */}
          {phase === 'active' && !panel && (
            <>
              <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', color: '#dff2fb', opacity: 0.8, fontSize: 18 }}>·</div>
              {hover && (
                <div style={{ position: 'absolute', left: '50%', top: '56%', transform: 'translateX(-50%)' }} className="mono">
                  <span className="badge badge-live" style={{ fontSize: 12 }}>E · {LABELS[hover] ?? hover}</span>
                </div>
              )}
              {!locked && (
                <div style={{ position: 'absolute', left: '50%', bottom: '18%', transform: 'translateX(-50%)' }} className="tiny">
                  Click to look around · WASD to move · E to use · Enter to chat · H for a hint
                </div>
              )}
            </>
          )}

          {/* CASS subtitles */}
          <div style={{ position: 'absolute', left: '50%', bottom: 86, transform: 'translateX(-50%)', width: 'min(720px, 90vw)' }}>
            {cassLines.filter((l) => Date.now() - l.at < 12000).map((l, i) => (
              <p key={l.at + i} className="small" style={{
                textAlign: 'center', background: 'rgba(11,17,20,0.82)', padding: '6px 14px',
                borderRadius: 3, marginTop: 6, color: '#cfe8f7',
              }}>{l.text}</p>
            ))}
          </div>

          {/* chat */}
          <div style={{ position: 'absolute', left: 14, bottom: 14, width: 300 }}>
            {chat.slice(-6).map((m, i) => (
              <p key={m.at + i} className="tiny" style={{ background: 'rgba(11,17,20,0.7)', padding: '3px 8px', marginTop: 2 }}>
                <strong>{m.from}:</strong> {m.text}
              </p>
            ))}
            {chatOpen && (
              <form onSubmit={(e) => {
                e.preventDefault();
                if (chatInput.trim()) send('chat', { text: chatInput });
                setChatInput(''); setChatOpen(false);
              }}>
                <input
                  autoFocus type="text" value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onBlur={() => setChatOpen(false)}
                  placeholder="Say it out loud…"
                  style={{ fontSize: 13, marginTop: 4 }}
                />
              </form>
            )}
          </div>

          {/* inventory + hint */}
          <div style={{ position: 'absolute', right: 14, bottom: 14, textAlign: 'right' }}>
            {pz?.inventory?.length ? (
              <p className="tiny mono" style={{ marginBottom: 6 }}>
                CARRYING: {pz.inventory.join(' · ')}
                {Object.entries(pz.keysHeld ?? {}).length > 0 && ' · override key'}
              </p>
            ) : null}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => send('hint.request')}>
              H · Ask CASS
            </button>
          </div>

          {/* interaction panel */}
          {panel && phase === 'active' && (
            <PanelHost
              id={panel}
              pz={pz}
              zone={myZone}
              cockpit={cockpit}
              station={station}
              burnWindowOpen={burnWindowOpen}
              burnAttempt={burnAttempt}
              stageIndex={stageIndex}
              msg={panelMsg}
              interact={interact}
              read={read}
              send={send}
              close={() => setPanel(null)}
            />
          )}

          {/* result */}
          {result && (
            <Center>
              <div className="panel" style={{ width: 440, borderColor: result.result === 'escaped' ? 'var(--accent)' : 'var(--warm-dark)' }}>
                <span className="eyebrow">{result.result === 'escaped' ? 'Return vector established' : 'The window closed'}</span>
                <h2 style={{ fontSize: 26, margin: '10px 0 14px' }}>
                  {result.result === 'escaped' ? 'You flew it home.' : 'Adrift — Anterra will come.'}
                </h2>
                <dl>
                  <div className="kv"><dt>Time remaining</dt><dd className="mono">{fmtClock(result.timeRemainingMs)}</dd></div>
                  <div className="kv"><dt>Hints used</dt><dd className="mono">{result.hintsUsed}</dd></div>
                  <div className="kv"><dt>Burn attempts</dt><dd className="mono">{result.attempts}</dd></div>
                  <div className="kv"><dt>Crew</dt><dd className="mono">{result.players}</dd></div>
                </dl>
                <a href={`/booking/${bookingId}`} className="btn btn-primary btn-block" style={{ marginTop: 16 }}>
                  Back to your booking
                </a>
              </div>
            </Center>
          )}
        </>
      )}
    </div>
  );
}

/* ================= panels ================= */

function PanelHost(props: {
  id: string;
  pz: PuzzlePublic | null;
  zone: ZoneId;
  cockpit: CockpitView | null;
  station: StationView | null;
  burnWindowOpen: boolean;
  burnAttempt: number;
  stageIndex: number;
  msg: string | null;
  interact: (p: string, a: string, pay?: unknown) => void;
  read: (what: string) => Promise<unknown>;
  send: (t: string, p?: unknown) => void;
  close: () => void;
}) {
  const { id } = props;
  return (
    <div style={panelWrap} role="dialog" aria-label={LABELS[id] ?? id}>
      <div className="spread" style={{ marginBottom: 12 }}>
        <strong className="mono" style={{ fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {LABELS[id] ?? id}
        </strong>
        <button type="button" className="btn btn-ghost btn-sm" onClick={props.close}>Esc ✕</button>
      </div>
      <PanelBody {...props} />
      {props.msg && <div className="notice notice-warn" style={{ marginTop: 12, fontSize: 13 }}>{props.msg}</div>}
    </div>
  );
}

function PanelBody(props: Parameters<typeof PanelHost>[0]) {
  const { id, pz, interact, read } = props;
  const [text, setText] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [rows, setRows] = useState<Record<string, unknown> | null>(null);
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Readable props load their text on open.
  useEffect(() => {
    const readable: Record<string, string> = {
      frag_pass: 'read_fragment_pass',
      frag_placard: 'read_fragment_placard',
      frag_itinerary: 'read_fragment_itinerary',
      frag_notice: 'read_fragment_notice',
      breaker_panel: 'read_breaker_placard',
      valve: 'read_valve_placard',
      galley_hatch: 'read_galley_hatch',
      crew_terminal: 'read_crew_log',
      fault_schematic: 'read_faults',
      pressures_display: 'read_pressures',
      interlock_display: 'read_interlocks',
      legend_A: 'read_legend', legend_B: 'read_legend', legend_C: 'read_legend',
      gauge_port: 'read_gauge',
    };
    const what = readable[id];
    if (what) {
      void read(what).then((d) => {
        const data = d as Record<string, unknown>;
        if (typeof data.text === 'string') setText(data.text);
        else setRows(data);
      });
    }
    return () => { if (holdRef.current) clearInterval(holdRef.current); };
  }, [id, read]);

  const solved = (p: string) => pz?.solved?.includes(p);

  switch (id) {
    /* ---- P1 ---- */
    case 'restraints':
      if (solved('P1')) return <p className="small">Everyone is out of their restraints.</p>;
      return (
        <>
          <p className="small" style={{ marginBottom: 12 }}>
            The powered release is dead. The safety card shows a manual lever inside the armrest —
            held together with your neighbour&rsquo;s.
          </p>
          <HoldButton
            label="HOLD RELEASE"
            onStart={() => interact('P1', 'hold_start')}
            onEnd={() => interact('P1', 'hold_end')}
          />
        </>
      );

    /* ---- P2 ---- */
    case 'breaker_panel':
      return (
        <>
          {text && <p className="tiny mono" style={{ marginBottom: 10 }}>{text}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {(pz?.breakers ?? []).map((closedState, i) => (
              <button
                key={i} type="button"
                className={`btn btn-sm ${closedState ? 'btn-primary' : 'btn-ghost'}`}
                disabled={pz?.busLocked || solved('P2')}
                onClick={() => interact('P2', 'toggle', { idx: i })}
              >
                {i + 1} · {closedState ? 'CLOSED' : 'OPEN'}
              </button>
            ))}
          </div>
          {pz?.busLocked && <p className="tiny" style={{ marginTop: 8, color: 'var(--accent-bright)' }}>Bus resetting…</p>}
        </>
      );

    /* ---- P3 ---- */
    case 'keypad':
      if (solved('P3')) return <p className="small">Override accepted. The hatch is pressure-inhibited — equalise to open it.</p>;
      return (
        <Keypad code={code} setCode={setCode} length={4} onEnter={() => { interact('P3', 'enter', { code }); setCode(''); }} />
      );

    /* ---- P4 ---- */
    case 'valve':
      if (solved('P4')) return <p className="small">Pressure equalised. The corridor is open.</p>;
      return (
        <>
          {text && <p className="tiny mono" style={{ marginBottom: 10 }}>{text}</p>}
          <p className="small" style={{ marginBottom: 10 }}>
            The gauge is at the aft door — someone has to read it back to you.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => interact('P4', 'valve', { delta: -4 })}>− bleed</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => interact('P4', 'valve', { delta: 2 })}>+ feed slow</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => interact('P4', 'valve', { delta: 6 })}>++ feed fast</button>
          </div>
        </>
      );

    case 'gauge_port':
      return (
        <LiveGauge read={read} />
      );

    /* ---- readable fragments & cards ---- */
    case 'frag_pass': case 'frag_placard': case 'frag_itinerary': case 'frag_notice':
    case 'galley_hatch':
      return <p className="small mono" style={{ lineHeight: 1.7 }}>{text ?? '…'}</p>;

    case 'crew_terminal': {
      const entries = (rows?.entries as string[]) ?? [];
      const checklist = rows?.checklist as string | undefined;
      return (
        <div className="stack">
          {entries.map((e, i) => <p key={i} className="small mono" style={{ lineHeight: 1.6 }}>{e}</p>)}
          {checklist && <p className="small mono" style={{ color: 'var(--accent-bright)' }}>{checklist}</p>}
        </div>
      );
    }

    /* ---- P5 / P6 combos ---- */
    case 'galley_locker':
      if (solved('P5')) return <p className="small">Stowage open — multi-tool, EVA glove and one suspicious ration tin recovered.</p>;
      return <Keypad code={code} setCode={setCode} length={3} onEnter={() => { interact('P5', 'enter', { combo: code }); setCode(''); }} />;

    case 'crew_locker':
      if (solved('P6')) return <p className="small">The crew token is in the team&rsquo;s hands now.</p>;
      return <Keypad code={code} setCode={setCode} length={4} onEnter={() => { interact('P6', 'enter', { combo: code }); setCode(''); }} />;

    /* ---- P7 ---- */
    case 'token_socket':
      if (pz?.tokenSocketed) return <p className="small">The token is seated. The hatch needs muscle now — the crank beside it.</p>;
      return (
        <button type="button" className="btn btn-primary" onClick={() => interact('P7', 'socket_token')}>
          Seat the crew token
        </button>
      );

    case 'hatch_crank':
      if (solved('P7')) return <p className="small">The flight deck is open.</p>;
      return (
        <>
          <p className="small" style={{ marginBottom: 10 }}>
            Work the crank and keep working it. Two people in phase are faster than one alone.
          </p>
          <HoldButton
            label="CRANK — HOLD"
            onStart={() => {
              interact('P7', 'crank_start');
              holdRef.current = setInterval(() => interact('P7', 'crank_tick'), 500);
            }}
            onEnd={() => {
              if (holdRef.current) clearInterval(holdRef.current);
              interact('P7', 'crank_end');
            }}
          />
        </>
      );

    /* ---- P8 ---- */
    case 'nav_console': {
      if (solved('P8')) return <p className="small">Navigation is up. The clock on every display is the real one.</p>;
      const steps = ['FUEL CELL', 'IMU ALIGN', 'BUS TIE', 'NAV CORE', 'COMM LINK', 'THERMAL'];
      return (
        <>
          <p className="tiny mono" style={{ marginBottom: 10 }}>
            BEZEL: COLD START IN PRINTED ORDER. CONSOLE REPORTS SELF-TEST PER SUBSYSTEM. SKIP FAILURES.
          </p>
          <p className="tiny" style={{ marginBottom: 10 }}>Progress: {(pz?.startProgress ?? []).join(' → ') || '—'}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
            {steps.map((s) => (
              <button
                key={s} type="button" className="btn btn-ghost btn-sm"
                disabled={pz?.startLocked || (pz?.startProgress ?? []).includes(s)}
                onClick={() => interact('P8', 'press', { step: s })}
              >{s}</button>
            ))}
          </div>
        </>
      );
    }

    /* ---- P9 ---- */
    case 'fault_schematic': {
      const clusters = (rows?.clusters as { id: string; code: string }[]) ?? [];
      if (rows?.error) return <p className="small">{String(rows.error)}</p>;
      return (
        <>
          <p className="tiny" style={{ marginBottom: 10 }}>
            The legend for these codes is on cards in the thruster bays. Mark every cluster.
          </p>
          <div className="stack">
            {clusters.map(({ id: cid, code: fcode }) => (
              <div key={cid} className="spread">
                <span className="mono small">{cid} · {fcode} {pz?.marks?.[cid] !== undefined && (pz.marks[cid] ? '→ USABLE' : '→ DEAD')}</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => interact('P9', 'mark', { clusterId: cid, usable: true })}>usable</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => interact('P9', 'mark', { clusterId: cid, usable: false })}>dead</button>
                </span>
              </div>
            ))}
          </div>
        </>
      );
    }

    case 'legend_A': case 'legend_B': case 'legend_C': {
      const legend = (rows?.legend as Record<string, string>) ?? null;
      if (rows?.error) return <p className="small">{String(rows.error)}</p>;
      return (
        <div className="stack">
          {legend && Object.entries(legend).map(([codeK, meaning]) => (
            <p key={codeK} className="small mono">{codeK} — {meaning}</p>
          ))}
        </div>
      );
    }

    /* ---- P10 ---- */
    case 'pressures_display': {
      const tanks = (rows?.tanks as { valve: string; open: boolean; pressure: number }[]) ?? [];
      if (rows?.error) return <p className="small">{String(rows.error)}</p>;
      return (
        <>
          <p className="tiny" style={{ marginBottom: 8 }}>{String(rows?.note ?? '')}</p>
          <table><tbody>
            {tanks.map((t) => (
              <tr key={t.valve}>
                <td className="mono">{t.valve}</td>
                <td className="mono">{t.open ? 'OPEN' : `${t.pressure} kPa`}</td>
              </tr>
            ))}
          </tbody></table>
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}
            onClick={() => void read('read_pressures').then((d) => setRows(d as Record<string, unknown>))}>
            Refresh
          </button>
        </>
      );
    }

    case 'xf_port_1': case 'xf_port_2': case 'xf_stbd_1': {
      const valveName = { xf_port_1: 'XF-PORT-1', xf_port_2: 'XF-PORT-2', xf_stbd_1: 'XF-STBD-1' }[id]!;
      const open = pz?.valvesOpen?.includes(valveName);
      if (open) return <p className="small mono">{valveName} — OPEN, feeding.</p>;
      return (
        <button type="button" className="btn btn-primary" onClick={() => interact('P10', 'open_valve', { valve: valveName })}>
          Open {valveName}
        </button>
      );
    }

    /* ---- P11 keys ---- */
    case 'key_rack':
      return (
        <KeyButton keyId="key-1" pz={pz} interact={interact} note="One burnt-orange override key, racked where the crew left it." />
      );
    case 'key_locker':
      return (
        <div className="stack">
          <KeyButton keyId="key-2" pz={pz} interact={interact} note="EVA locker key two." />
          <KeyButton keyId="key-3" pz={pz} interact={interact} note="EVA locker key three." />
        </div>
      );

    /* ---- P12 display ---- */
    case 'interlock_display': {
      const codes = (rows?.codes as Record<string, string>) ?? null;
      if (rows?.error) return <p className="small">{String(rows.error)}</p>;
      return (
        <div className="stack">
          <p className="tiny">These display here and nowhere else. The panels are in the bays.</p>
          {codes && Object.entries(codes).map(([st, cd]) => (
            <p key={st} className="mono" style={{ fontSize: 20, color: 'var(--accent-bright)' }}>STATION {st} — {cd}</p>
          ))}
        </div>
      );
    }

    /* ---- stations (P11 socket, P12 entry, P14 panel) ---- */
    case 'station_A': case 'station_B': case 'station_C':
      return <StationPanel {...props} stationId={id.slice(-1)} codeState={[code, setCode]} />;

    /* ---- cockpit burn console ---- */
    case 'burn_console':
      return <BurnConsole {...props} />;

    default:
      return <p className="small">Nothing here yet.</p>;
  }
}

function KeyButton({ keyId, pz, interact, note }: {
  keyId: string; pz: PuzzlePublic | null;
  interact: (p: string, a: string, pay?: unknown) => void; note: string;
}) {
  const holder = pz?.keysHeld?.[keyId];
  const gone = holder || (pz?.keysSocketed?.length ?? 0) >= 3;
  return (
    <div>
      <p className="tiny" style={{ marginBottom: 6 }}>{note}</p>
      {holder
        ? <p className="small mono">Taken.</p>
        : <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(gone && !holder)}
            onClick={() => interact('P11', 'take_key', { keyId })}>Take the key</button>}
    </div>
  );
}

function StationPanel(props: Parameters<typeof PanelHost>[0] & {
  stationId: string; codeState: [string, (s: string) => void];
}) {
  const { stationId, station, pz, interact, send, burnWindowOpen } = props;
  const [codeVal, setCodeVal] = props.codeState;
  const [thrust, setThrust] = useState(50);
  const [gimbal, setGimbal] = useState(0);
  const holdingRef = useRef(false);

  const socketed = pz?.keysSocketed?.includes(stationId);
  const view = station && station.station === stationId ? station : null;

  if (!socketed) {
    return (
      <>
        <p className="small" style={{ marginBottom: 10 }}>The station is dark. Its socket wants a burnt-orange override key.</p>
        <button type="button" className="btn btn-primary" onClick={() => interact('P11', 'socket_key', { station: stationId })}>
          Socket my key
        </button>
      </>
    );
  }

  if (!view?.interlockCleared) {
    return (
      <>
        <p className="small" style={{ marginBottom: 10 }}>
          IGNITION INTERLOCK. The code for this station displays on the flight deck — not here.
        </p>
        <Keypad code={codeVal} setCode={setCodeVal} length={4}
          onEnter={() => { interact('P12', 'enter_interlock', { station: stationId, code: codeVal }); setCodeVal(''); }} />
      </>
    );
  }

  if (!burnWindowOpen) return <p className="small">Station ready. Waiting on the rest of the ship.</p>;

  return (
    <>
      <p className="tiny" style={{ marginBottom: 10 }}>
        The commanded numbers exist on the flight deck only. Someone says them; you set them.
      </p>
      <Slider label="Thrust" unit="%" min={0} max={100} step={0.5} value={thrust}
        disabled={Boolean(view?.armed)}
        onChange={(v) => { setThrust(v); send('station.set', { station: stationId, thrustPct: v, gimbalDeg: gimbal }); }} />
      <Slider label="Gimbal" unit="°" min={-25} max={25} step={0.1} value={gimbal}
        disabled={Boolean(view?.armed)}
        onChange={(v) => { setGimbal(v); send('station.set', { station: stationId, thrustPct: thrust, gimbalDeg: v }); }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" className={`btn btn-sm ${view?.armed ? 'btn-primary' : 'btn-ghost'}`} style={{ flex: 1 }}
          onClick={() => send('station.arm', { station: stationId, armed: !view?.armed })}>
          {view?.armed ? 'ARMED — safe it' : 'ARM'}
        </button>
      </div>
      <button
        type="button"
        disabled={!view?.armed}
        className="btn btn-block"
        style={{
          marginTop: 8, userSelect: 'none', touchAction: 'none',
          background: holdingRef.current ? 'var(--accent-bright)' : 'var(--warm-dark)',
          color: holdingRef.current ? '#04202e' : 'var(--accent-bright)',
          border: '1px solid var(--accent-deep)',
        }}
        onPointerDown={() => { holdingRef.current = true; send('station.ignite', { station: stationId }); }}
        onPointerUp={() => { holdingRef.current = false; send('station.release', { station: stationId }); }}
        onPointerLeave={() => { if (holdingRef.current) { holdingRef.current = false; send('station.release', { station: stationId }); } }}
      >
        HOLD TO IGNITE
      </button>
    </>
  );
}

function BurnConsole(props: Parameters<typeof PanelHost>[0]) {
  const { cockpit, burnWindowOpen, burnAttempt, stageIndex, send } = props;
  if (!burnWindowOpen) {
    return <p className="small">The computer is still waiting on interlocks. Solve the ship first.</p>;
  }
  if (!cockpit) return <p className="small mono">Acquiring solution…</p>;
  const { stage, readiness, stagesTotal } = cockpit;
  return (
    <>
      <div className="spread" style={{ marginBottom: 10 }}>
        <span className="mono small">STAGE {stage.index + 1}/{stagesTotal} · {stage.label} · attempt {burnAttempt + 1}</span>
        <span className="badge badge-live">hold {(stage.durationMs / 1000).toFixed(1)}s</span>
      </div>
      <table><thead><tr><th>Stn</th><th>Thrust</th><th>Gimbal</th><th>Arm order</th><th>Status</th></tr></thead><tbody>
        {Object.entries(stage.settings).map(([st, v]) => (
          <tr key={st}>
            <td className="mono">{st}</td>
            <td className="mono" style={{ color: 'var(--accent-bright)' }}>{v.thrustPct}%</td>
            <td className="mono" style={{ color: 'var(--accent-bright)' }}>{v.gimbalDeg}°</td>
            <td className="mono">{stage.armingOrder.indexOf(st) + 1}</td>
            <td className="tiny">
              {readiness[st]?.armed ? 'ARMED' : readiness[st]?.dialsTouched ? 'set' : readiness[st]?.interlockCleared ? 'ready' : '—'}
            </td>
          </tr>
        ))}
      </tbody></table>
      <p className="tiny" style={{ margin: '10px 0' }}>
        Nothing transmits these numbers to the bays. Say them. Then count the ignition down out loud.
      </p>
      <button type="button" className="btn btn-primary btn-block" onClick={() => send('burn.execute')}>
        COMMIT THE MANOEUVRE
      </button>
      <p className="tiny" style={{ marginTop: 8 }}>Commit after every station has held its burn. Stage index resets on a failed attempt — with new numbers.</p>
    </>
  );
}

/* ================= small shared pieces ================= */

function LiveGauge({ read }: { read: (w: string) => Promise<unknown> }) {
  const [value, setValue] = useState<number | null>(null);
  useEffect(() => {
    let on = true;
    const poll = async () => {
      const d = (await read('read_gauge')) as { value?: number };
      if (on && typeof d.value === 'number') setValue(d.value);
    };
    void poll();
    const t = setInterval(poll, 1200);
    return () => { on = false; clearInterval(t); };
  }, [read]);
  return (
    <div style={{ textAlign: 'center' }}>
      <p className="tiny" style={{ marginBottom: 6 }}>MANIFOLD PRESSURE</p>
      <p className="mono" style={{ fontSize: 42, color: 'var(--accent-bright)' }}>{value ?? '—'}<span style={{ fontSize: 16 }}> kPa</span></p>
      <p className="tiny">The target band is written at the valve. Shout the number.</p>
    </div>
  );
}

function HoldButton({ label, onStart, onEnd }: { label: string; onStart: () => void; onEnd: () => void }) {
  const [held, setHeld] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-block"
      style={{
        userSelect: 'none', touchAction: 'none', padding: '18px 0',
        background: held ? 'var(--accent-bright)' : 'var(--warm-dark)',
        color: held ? '#04202e' : 'var(--accent-bright)',
        border: '1px solid var(--accent-deep)',
      }}
      onPointerDown={() => { setHeld(true); onStart(); }}
      onPointerUp={() => { setHeld(false); onEnd(); }}
      onPointerLeave={() => { if (held) { setHeld(false); onEnd(); } }}
    >
      {held ? 'HOLDING…' : label}
    </button>
  );
}

function Keypad({ code, setCode, length, onEnter }: {
  code: string; setCode: (s: string) => void; length: number; onEnter: () => void;
}) {
  return (
    <div style={{ width: 220 }}>
      <div className="mono" style={{
        fontSize: 26, textAlign: 'center', letterSpacing: '0.4em',
        background: 'var(--bg)', padding: '8px 0', marginBottom: 10, minHeight: 44,
      }}>{code.padEnd(length, '·')}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => (
          <button key={d} type="button" className="btn btn-ghost btn-sm"
            style={d === 0 ? { gridColumn: 2 } : undefined}
            onClick={() => code.length < length && setCode(code + String(d))}>{d}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button type="button" className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setCode('')}>clear</button>
        <button type="button" className="btn btn-primary btn-sm" style={{ flex: 2 }} disabled={code.length !== length} onClick={onEnter}>ENTER</button>
      </div>
    </div>
  );
}

function Slider({ label, unit, min, max, step, value, disabled, onChange }: {
  label: string; unit: string; min: number; max: number; step: number;
  value: number; disabled?: boolean; onChange: (v: number) => void;
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <div className="spread" style={{ marginBottom: 4 }}>
        <label style={{ margin: 0 }}>{label}</label>
        <span className="mono">{value.toFixed(step < 1 ? 1 : 0)}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }} aria-label={label} />
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#0b1114' }}>{children}</div>;
}
function Center({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'rgba(11,17,20,0.72)' }}>
      {children}
    </div>
  );
}

const hudBar: React.CSSProperties = {
  position: 'absolute', top: 0, left: 0, right: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '10px 18px', background: 'linear-gradient(180deg, rgba(11,17,20,0.85), transparent)',
};

const panelWrap: React.CSSProperties = {
  position: 'absolute', right: 20, top: 70, width: 'min(400px, calc(100vw - 40px))',
  maxHeight: 'calc(100vh - 160px)', overflowY: 'auto',
  background: 'var(--bg-panel)', border: '1px solid var(--border-strong)',
  borderRadius: 3, padding: 18, boxShadow: '0 10px 40px rgba(0,0,0,0.55)',
};

function fmtClock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
