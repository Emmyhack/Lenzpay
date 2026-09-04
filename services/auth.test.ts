import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMockGoogleAuth,
  exchangeGoogleIdToken,
  initialsFor,
  type AuthHttpClient,
} from './auth';

/**
 * Google sign-up.
 *
 * What matters here is the boundary: Google proves an email, and nothing more.
 * The tests pin the places where treating it as more than that would create an
 * account that cannot be paid to or from.
 */

test('a successful sign-in returns a verified identity and a token', async () => {
  const result = await createMockGoogleAuth({ latencyMs: 0 }).signIn();

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.identity.emailVerified, true);
  assert.match(result.identity.email, /@/);
  assert.ok(result.identity.googleId);
  assert.ok(result.idToken);
});

test('the identity is keyed on the Google id, not the email', async () => {
  const result = await createMockGoogleAuth({ latencyMs: 0 }).signIn();

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.notEqual(
    result.identity.googleId,
    result.identity.email,
    'an email can be reassigned by a workspace admin; the subject id cannot'
  );
});

test('a cancelled sheet is not an error', async () => {
  const result = await createMockGoogleAuth({ cancel: true, latencyMs: 0 }).signIn();

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(
    result.reason,
    'cancelled',
    'dismissing the Google sheet is a decision, not a failure to report'
  );
});

test('an unverified email is surfaced rather than assumed', async () => {
  const result = await createMockGoogleAuth({
    latencyMs: 0,
    identity: { emailVerified: false },
  }).signIn();

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(
    result.identity.emailVerified,
    false,
    'the caller must be able to refuse an address Google itself has not proven'
  );
});

// ---------------------------------------------------------------------------
// Backend exchange
// ---------------------------------------------------------------------------

function client(handler: (url: string, body: unknown) => unknown): AuthHttpClient {
  return {
    async post<T>(url: string, body: unknown) {
      return { data: handler(url, body) as T };
    },
  };
}

test('the ID token is posted to the backend for verification', async () => {
  const seen: { url: string; body: unknown }[] = [];
  const result = await exchangeGoogleIdToken(
    client((url, body) => {
      seen.push({ url, body });
      return { token: 'sess_1', isNewUser: true };
    }),
    'the.id.token'
  );

  assert.equal(result.ok, true);
  assert.equal(seen[0].url, '/auth/google');
  assert.deepEqual(seen[0].body, { idToken: 'the.id.token' });
});

test('a response without a session token is a failure, not a silent pass', async () => {
  const result = await exchangeGoogleIdToken(client(() => ({ isNewUser: true })), 'tok');

  assert.equal(
    result.ok,
    false,
    'a missing token must never be treated as a successful sign-in'
  );
});

test('an unreachable backend fails without leaking transport detail', async () => {
  const result = await exchangeGoogleIdToken(
    {
      async post() {
        throw new Error('Request failed with status code 500');
      },
    },
    'tok'
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.doesNotMatch(result.message, /500/);
});

// ---------------------------------------------------------------------------
// Initials
// ---------------------------------------------------------------------------

test('initials come from the first and last name', () => {
  assert.equal(initialsFor('Ada Okafor', 'a@b.com'), 'AO');
  assert.equal(initialsFor('Ada Ngozi Okafor', 'a@b.com'), 'AO');
});

test('a single name still produces initials', () => {
  assert.equal(initialsFor('Ada', 'a@b.com'), 'AD');
});

test('initials fall back to the email when Google withholds a name', () => {
  assert.equal(
    initialsFor('   ', 'zainab@gmail.com'),
    'ZA',
    'a blank avatar is worse than an approximate one'
  );
});
