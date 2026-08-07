'use client';

import { useState } from 'react';

/**
 * Recording consent gate.
 *
 * Three separate things, deliberately not bundled into one switch:
 *
 *   1. Gameplay and input capture — always on. No personal content; it is what makes an issue
 *      report provable instead of arguable.
 *   2. Images and video for social use — ON by default, with an opt-out.
 *   3. Team voice recording — OFF by default, opt-in only. Recording a conversation without every
 *      participant knowing is illegal in much of the world, and a room whose mechanic is people
 *      talking freely is worse if they are unsure who is listening.
 *
 * Opting out of (2) also removes the visual record we would use to investigate a problem, so that
 * consequence is stated plainly at the point of choosing rather than discovered later.
 */
export default function RecordingConsent({ sessionId, seatId }: { sessionId: string; seatId?: string }) {
  const [mediaSocialUse, setMediaSocialUse] = useState(true); // opt-out
  const [voice, setVoice] = useState(false);                  // opt-in
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await fetch('/api/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, seatId, voiceRecording: voice, mediaSocialUse }),
      });
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h3 style={{ fontSize: 17, marginBottom: 6 }}>What we record</h3>
      <p className="tiny" style={{ marginBottom: 16 }}>
        Recording is how we prove what went wrong when something does. Under our terms, qualifying
        problems are resolved with credit — and the session record is what turns your report into a
        finding rather than a judgement call.
      </p>

      <div className="stack" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <span className="badge badge-live" style={{ flex: 'none', alignSelf: 'flex-start' }}>always on</span>
          <p className="small" style={{ margin: 0 }}>
            <strong>Gameplay and controls.</strong> Every puzzle interaction, which controls you
            used, and the state of the ship. It records <em>which</em> control you pressed — never
            what you typed.
          </p>
        </div>

        <label style={rowStyle}>
          <input
            type="checkbox"
            checked={mediaSocialUse}
            onChange={(e) => { setMediaSocialUse(e.target.checked); setSaved(false); }}
            style={boxStyle}
          />
          <span className="small">
            <strong>Capture images and video of our session, and allow their use on social media.</strong>{' '}
            On by default. This covers in-game footage and the team image — it is how we make
            trailers, clips and your shareable results.
          </span>
        </label>

        {!mediaSocialUse && (
          <div className="notice notice-warn" style={{ marginLeft: 26 }}>
            <strong>Heads up — this affects our ability to help you.</strong> Turning this off also
            turns off the visual capture we would use to investigate a problem. If something goes
            wrong in this session, we will be working from the event log and your description alone,
            without being able to see what you saw. That makes some issues harder to diagnose and
            some reports harder to substantiate. You can still play, and you can still report a
            problem — we will simply have less to go on.
          </div>
        )}

        <label style={rowStyle}>
          <input
            type="checkbox"
            checked={voice}
            onChange={(e) => { setVoice(e.target.checked); setSaved(false); }}
            style={boxStyle}
          />
          <span className="small">
            <strong>Record our team voice.</strong> Off unless you tick it, and only kept if{' '}
            <em>every</em> player in your group agrees. Audio helps enormously with diagnosing
            confusion and coordination problems — but it is your conversation, so it is yours to
            decline without any argument from us.
          </span>
        </label>
      </div>

      <button type="button" onClick={save} className="btn btn-ghost btn-sm" disabled={busy}>
        {busy ? 'Saving…' : saved ? 'Saved' : 'Save my choices'}
      </button>

      <p className="tiny" style={{ marginTop: 12 }}>
        Change these any time before the game starts. Voice recording is shown in the HUD the entire
        time it is active — you will never be recorded without seeing that you are.
      </p>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  cursor: 'pointer',
  margin: 0,
  color: 'inherit',
  fontSize: 'inherit',
};

const boxStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  marginTop: 3,
  flex: 'none',
  accentColor: 'var(--accent)',
};
