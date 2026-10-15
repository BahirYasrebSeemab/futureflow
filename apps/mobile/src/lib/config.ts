/** A problem with the build itself: shown on a full screen, because nothing else can work. */
export class StartupError extends Error {
  override name = 'StartupError';
}

// React Native's URL class is incomplete (no hostname/protocol), so the address is parsed by hand.
const URL_SHAPE = /^(https?):\/\/([A-Za-z0-9.-]+)(:\d{1,5})?(\/[A-Za-z0-9._~\-/]*)?$/;
const LOCAL_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '10.0.2.2']);

/**
 * Reads EXPO_PUBLIC_API_URL: https, or plain http to a local host only when the build allows
 * cleartext (development and the CI emulator build). Elsewhere Android would block it silently.
 */
export function parseApiUrl(raw: string | undefined, options: { allowHttp: boolean }): string {
  const value = raw?.trim() ?? '';
  if (value === '') {
    throw new StartupError(
      'This build has no server address. Set EXPO_PUBLIC_API_URL and rebuild.',
    );
  }
  const match = URL_SHAPE.exec(value);
  if (match === null) {
    throw new StartupError('The server address in this build is not a valid URL.');
  }
  const [, scheme, host = '', port = '', path = ''] = match;
  if (scheme === 'http' && !(options.allowHttp && LOCAL_HOSTS.has(host))) {
    throw new StartupError('The server address must use https.');
  }
  return `${scheme}://${host}${port}${path.replace(/\/+$/, '')}`;
}
