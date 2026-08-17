import { authErrorMessage } from '../authErrors';

describe('authErrorMessage', () => {
  it('maps invalid credentials', () => {
    expect(authErrorMessage(new Error('Invalid login credentials'))).toMatch(
      /do not match/,
    );
  });

  it('maps duplicate accounts', () => {
    expect(authErrorMessage(new Error('User already registered'))).toMatch(
      /already exists/,
    );
  });

  it('maps short passwords', () => {
    expect(
      authErrorMessage(new Error('Password should be at least 8 characters')),
    ).toMatch(/at least 8/);
  });

  it('maps rate limits', () => {
    expect(authErrorMessage(new Error('email rate limit exceeded'))).toMatch(
      /Wait a minute/,
    );
  });

  it('maps unconfirmed emails', () => {
    expect(authErrorMessage(new Error('Email not confirmed'))).toMatch(/inbox/);
  });

  it('maps network failures', () => {
    expect(authErrorMessage(new TypeError('Network request failed'))).toMatch(
      /connection/,
    );
  });

  it('passes unknown messages through', () => {
    expect(authErrorMessage(new Error('Weird new failure'))).toBe(
      'Weird new failure',
    );
  });

  it('never returns an empty string', () => {
    expect(authErrorMessage(undefined)).not.toBe('');
    expect(authErrorMessage(null)).not.toBe('');
    expect(authErrorMessage('not an error')).not.toBe('');
  });
});
