/** Maps GoTrue errors to sentences a person can act on. Pure on purpose —
 *  testable without dragging the native auth stack into Jest. */
export function authErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : '';
  const message = raw.toLowerCase();

  if (message.includes('invalid login')) {
    return 'That email and password do not match an account.';
  }
  if (message.includes('already registered')) {
    return 'An account with this email already exists. Sign in instead.';
  }
  if (message.includes('password should be')) {
    return 'That password is too short — use at least 8 characters.';
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (message.includes('not confirmed')) {
    return 'This email has not been confirmed yet — check your inbox.';
  }
  if (message.includes('network') || message.includes('fetch')) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return raw || 'Something went wrong. Try again.';
}
