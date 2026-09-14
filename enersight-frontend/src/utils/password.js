// Client-side mirror of validate_password in enersight-backend/app/auth.py.
//
// Three different rules used to apply: sign-up accepted a single character, the
// Settings page demanded six, and admin-created accounts had no rule at all. So a
// user could register with a password that the system would then refuse to let them
// change to. The strength meter on the sign-up form was decorative and never
// blocked submission.
//
// Keep this in step with MIN_PASSWORD_LENGTH on the backend. This exists to tell
// the user before they submit; the backend is still the authority.

export const MIN_PASSWORD_LENGTH = 8;

/** Returns an error message, or null when the password is acceptable. */
export function getPasswordError(password) {
  const candidate = String(password ?? "").trim();

  if (!candidate) {
    return "Please enter a password.";
  }

  if (candidate.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }

  const isAllDigits = /^[0-9]+$/.test(candidate);
  const isAllLetters = /^[A-Za-z]+$/.test(candidate);

  if (isAllDigits || isAllLetters) {
    return "Password must mix letters with numbers or symbols.";
  }

  return null;
}

/**
 * 0-3 score for the strength meter. Unlike the error above this is only advisory:
 * a password can be acceptable and still score low.
 */
export function getPasswordStrength(password) {
  const candidate = String(password ?? "");

  if (!candidate) {
    return null;
  }

  let score = 0;

  if (candidate.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (candidate.length >= 12) score += 1;
  if (/[0-9]/.test(candidate) && /[A-Za-z]/.test(candidate)) score += 1;
  if (/[^A-Za-z0-9]/.test(candidate)) score += 1;

  return Math.min(score, 3);
}
