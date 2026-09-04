import { Config } from '@/constants/config';
import { delay } from '@/mock/delay';

/**
 * Account creation, including Google sign-up.
 *
 * The screens have referenced `services/auth.ts` since before it existed
 * ("Replace with services/auth.ts once a real signup endpoint exists"). This
 * is that seam.
 *
 * ## What Google can and cannot do here
 *
 * Google gives us a **verified email and a name**. That is genuinely useful:
 * it removes typing, and it proves the address belongs to the person holding
 * the account. It is not, on its own, enough to open a LenzPay account.
 *
 * A payment account in Nigeria is keyed to a **phone number** — it is what a
 * NUBAN lookup, a direct-debit mandate and KYC are all tied to, and it is what
 * a payee sees. So Google shortens the form and verifies the email; the phone
 * number still has to be supplied and still has to pass OTP. Treating a Google
 * login as a complete identity would mean an account that cannot actually be
 * paid to or from.
 *
 * ## What is real here and what is not
 *
 * The provider interface, the identity shape and the flow are real. The OAuth
 * handshake is **not** — see `createMockGoogleAuth`. Making it real needs three
 * things that do not exist yet, and none of them are client-side decisions:
 *
 *  1. `expo-auth-session` (plus `expo-crypto`) installed, and a native rebuild
 *  2. OAuth client IDs per platform, from Google Cloud Console
 *  3. A backend route that takes the ID token, **verifies its signature and
 *     audience against Google's keys**, and issues a LenzPay session
 *
 * Point 3 is the one that matters. An ID token verified only on the phone is
 * worth nothing — a client can claim any identity it likes. Until a backend
 * verifies it, this stays mocked rather than pretending to authenticate.
 */

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/** The subset of Google's ID token claims this product actually uses. */
export interface GoogleIdentity {
  /** Google's stable user id (`sub`). The join key, never the email. */
  googleId: string;
  email: string;
  /** Google's own verification of the address. Never assume true. */
  emailVerified: boolean;
  fullName: string;
  givenName?: string;
  familyName?: string;
  pictureUrl?: string;
}

export type GoogleAuthResult =
  | { ok: true; identity: GoogleIdentity; idToken: string }
  | { ok: false; reason: 'cancelled' | 'failed'; message: string };

export interface GoogleAuthProvider {
  /** Runs the OAuth handshake and returns the identity Google asserts. */
  signIn(): Promise<GoogleAuthResult>;
}

// ---------------------------------------------------------------------------
// Mock provider
// ---------------------------------------------------------------------------

export interface MockGoogleOptions {
  identity?: Partial<GoogleIdentity>;
  /** Simulate the user dismissing the Google sheet. */
  cancel?: boolean;
  latencyMs?: number;
}

/**
 * Stands in for the OAuth handshake in demo mode.
 *
 * Deliberately returns a *fixed* identity rather than anything resembling a
 * real account, so nothing in the app can mistake this for an authenticated
 * user. It mirrors the mock OTP convention already used in `(auth)/otp.tsx`.
 */
export function createMockGoogleAuth(options: MockGoogleOptions = {}): GoogleAuthProvider {
  const { cancel = false, latencyMs = 700 } = options;

  return {
    async signIn(): Promise<GoogleAuthResult> {
      await delay(latencyMs);

      if (cancel) {
        return { ok: false, reason: 'cancelled', message: 'Sign-in cancelled.' };
      }

      const identity: GoogleIdentity = {
        googleId: 'google_mock_1094857362',
        email: 'ada.okafor@gmail.com',
        emailVerified: true,
        fullName: 'Ada Okafor',
        givenName: 'Ada',
        familyName: 'Okafor',
        ...options.identity,
      };

      return { ok: true, identity, idToken: 'mock.id.token' };
    },
  };
}

// ---------------------------------------------------------------------------
// Backend exchange
// ---------------------------------------------------------------------------

export interface AuthHttpClient {
  post<T>(url: string, body: unknown): Promise<{ data: T }>;
}

export interface SessionResponse {
  token: string;
  /** True when this Google account has no LenzPay account yet. */
  isNewUser: boolean;
  /** Present for a returning user whose phone is already verified. */
  phone?: string;
}

export type ExchangeResult =
  | { ok: true; session: SessionResponse }
  | { ok: false; message: string };

/**
 * Trade a Google ID token for a LenzPay session.
 *
 * The backend must verify the token's signature, issuer and audience against
 * Google's published keys before trusting a single claim in it. Decoding it
 * client-side and believing the payload is not authentication — anyone can
 * mint a plausible-looking JWT.
 */
export async function exchangeGoogleIdToken(
  client: AuthHttpClient,
  idToken: string
): Promise<ExchangeResult> {
  try {
    const { data } = await client.post<SessionResponse>('/auth/google', { idToken });
    if (!data?.token) {
      return { ok: false, message: 'Could not complete sign-in. Please try again.' };
    }
    return { ok: true, session: data };
  } catch {
    return { ok: false, message: 'Could not reach LenzPay just now. Please try again.' };
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

let provider: GoogleAuthProvider | null = null;

/** Swap in the real provider once the OAuth handshake exists. */
export function configureGoogleAuth(next: GoogleAuthProvider): void {
  provider = next;
}

export function googleAuth(): GoogleAuthProvider {
  if (provider) return provider;
  if (!Config.useMockData) {
    throw new Error(
      'Google sign-in has no provider configured. Call configureGoogleAuth() with a real OAuth provider before disabling mock data.'
    );
  }
  provider = createMockGoogleAuth();
  return provider;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "Ada Okafor" → "AO". Falls back to the email when Google withholds a name. */
export function initialsFor(fullName: string, email: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length > 0) return parts[0].slice(0, 2).toUpperCase();
  return (email.slice(0, 2) || '??').toUpperCase();
}
