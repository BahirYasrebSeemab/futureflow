# Releasing the APK (EAS)

The APK is built on Expo's servers (EAS), not on your laptop. The free plan allows 15 Android
builds a month, so a build only starts from a `v*` tag (spec §14). Deploy the API first
(`docs/deploy.md`): the APK needs its address.

## Once

1. **Log in** (a free Expo account): `! bun x eas-cli login`
2. **Create the project:** `cd apps/mobile && bun x eas-cli init`. It prints a project id. Paste it
   into `EAS_PROJECT_ID` at the top of `apps/mobile/app.config.ts` (not a secret) and commit.
3. **The API address:** put the deployed address (`https://futureflow-api.<you>.workers.dev`) into
   `build.production.env.EXPO_PUBLIC_API_URL` in `apps/mobile/eas.json` and commit. A production
   build refuses to start without an https address.
   Only this value counts for production: it overrides an EAS environment variable of the same
   name.
4. **The signing key:** `bun x eas-cli credentials -p android`, choose the production profile and let
   EAS create a keystore. A tagged build can't create one (it runs without questions), and the same
   key must sign every later update. EAS keeps it; download a backup from expo.dev.
5. **A token for GitHub:** on expo.dev, Account settings → Access tokens → Create. Then
   `gh secret set EXPO_TOKEN` and paste it.

## Each release

```sh
git checkout main && git pull
git tag v1.0.0 && git push origin v1.0.0
```

The **Release** workflow starts the EAS build and returns. Follow it on expo.dev (or
`bun x eas-cli build:list`); when it finishes, open the APK link on the phone and install it.

Without GitHub: `cd apps/mobile && bun x eas-cli build --platform android --profile production`
does the same from your laptop (the build still runs on EAS).

## On the phone

1. Allow installing from the browser when Android asks.
2. Open FutureFlow and pair with the `SETUP_CODE`.
3. Guard: open App info → ⋮ → **Allow restricted settings**, then switch the guard on.
4. Work through **Keep it running** on the Guard screen.
