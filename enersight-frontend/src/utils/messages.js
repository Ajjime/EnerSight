// Messages shared across pages, written for the people using the system rather
// than for whoever runs the server. Thirty error toasts used to say "Please make
// sure FastAPI is running."

export const SERVER_UNREACHABLE =
  "Can't reach the server. Check your connection and try again.";

/**
 * The message to show for a failed request. fetch() rejects with a TypeError
 * ("Failed to fetch") when the server cannot be reached; that is replaced with
 * SERVER_UNREACHABLE. Errors the page threw itself keep their own message.
 */
export function describeError(error) {
  if (!error || error instanceof TypeError || !error.message) {
    return SERVER_UNREACHABLE;
  }

  return error.message;
}
