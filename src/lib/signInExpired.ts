/** The message a sync reports when OneDrive says the stored sign-in can no longer be renewed
 * (the web app's refresh token lasts about a day). The UI recognises it by this exact text to
 * show "Sign in again" instead of just a failure. Kept in its own module so both the web
 * engine and the shared UI code can import it without pulling in each other. */
export const SIGN_IN_EXPIRED_MESSAGE =
  "Your OneDrive sign-in has expired. Your notes are safe on this device. Choose Sign in again (in Settings or the cloud menu) to keep syncing.";
