/**
 * What must hold before a store APK is built (EAS profile `production`), checked when the Expo
 * config loads so a wrong build fails at once instead of shipping. Other builds aren't checked.
 */
export type ReleaseInputs = Readonly<{
  profile: string | undefined;
  apiUrl: string | undefined;
  e2e: boolean;
}>;

export function releaseProblems({ profile, apiUrl, e2e }: ReleaseInputs): string[] {
  if (profile !== 'production') return [];
  return [
    ...(apiUrl === undefined || !/^https:\/\/[^\s/]+/.test(apiUrl.trim())
      ? ['EXPO_PUBLIC_API_URL must be the https address of the deployed API']
      : []),
    ...(e2e ? ['E2E must not be set for a production build'] : []),
  ];
}
