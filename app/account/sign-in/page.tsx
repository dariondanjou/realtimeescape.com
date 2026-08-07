import type { Metadata } from 'next';
import { supabaseConfigured } from '@/lib/supabase';
import SignInForm from './SignInForm';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

export default function SignInPage() {
  return (
    <section className="section">
      <div className="wrap narrow" style={{ maxWidth: 460 }}>
        <span className="eyebrow eyebrow-dim">Account</span>
        <h1 style={{ fontSize: 30, margin: '12px 0 8px' }}>Sign in</h1>
        <p className="small" style={{ marginBottom: 26 }}>
          You do not need an account to play a game somebody invited you to. An account keeps your
          bookings, your results and your avatar in one place.
        </p>

        {supabaseConfigured() ? (
          <SignInForm />
        ) : (
          <div className="notice notice-warn">
            Accounts are not configured on this deployment yet.
          </div>
        )}
      </div>
    </section>
  );
}
