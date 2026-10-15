// Day keys depend on the local timezone. Jest workers inherit the parent's environment, so pin it
// here (before workers start) and every machine runs the tests in UTC.
export default function globalSetup(): void {
  process.env.TZ = 'UTC';
}
