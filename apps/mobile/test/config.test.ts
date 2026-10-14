import { parseApiUrl, StartupError } from '@/lib/config';

test.each([
  ['https://futureflow-api.example.workers.dev', 'https://futureflow-api.example.workers.dev'],
  ['https://api.example.com/', 'https://api.example.com'],
  ['  https://api.example.com/base//  ', 'https://api.example.com/base'],
  ['http://10.0.2.2:8787', 'http://10.0.2.2:8787'],
  ['http://localhost:8787', 'http://localhost:8787'],
])('accepts %s', (raw, expected) => {
  expect(parseApiUrl(raw)).toBe(expected);
});

test.each([
  [undefined, 'no server address'],
  ['', 'no server address'],
  ['api.example.com', 'not a valid URL'],
  ['ftp://api.example.com', 'not a valid URL'],
  ['http://api.example.com', 'must use https'],
  ['https://api.example.com?x=1', 'not a valid URL'],
])('refuses %p', (raw, message) => {
  expect(() => parseApiUrl(raw)).toThrow(StartupError);
  expect(() => parseApiUrl(raw)).toThrow(message);
});
