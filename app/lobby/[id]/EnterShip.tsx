'use client';

import { useState } from 'react';

/** Asks for a call-sign, then boards. The name rides to the game as the avatar label. */
export default function EnterShip({ bookingId, enabled }: { bookingId: string; enabled: boolean }) {
  const [name, setName] = useState('');

  if (!enabled) {
    return <span className="btn btn-ghost" aria-disabled>Waiting on your group</span>;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = name.trim() || 'Passenger';
        window.location.href = `/play/${bookingId}?name=${encodeURIComponent(n)}`;
      }}
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name, for the crew"
        maxLength={24}
        style={{ maxWidth: 220 }}
      />
      <button type="submit" className="btn btn-primary">Enter the ship</button>
    </form>
  );
}
