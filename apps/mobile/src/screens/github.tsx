import { RepoNameSchema } from '@futureflow/contracts';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { Banner } from '@/components/banner';
import { useBottomPadding } from '@/components/bottom-padding';
import { Button } from '@/components/button';
import type { ApiFailure, GithubLink } from '@/lib/api/client';
import { useApp } from '@/lib/app';
import { radius, space, usePalette } from '@/theme';

const MAX_REPOS = 10;

const reposOf = (text: string): string[] =>
  text
    .split(/[\s,]+/)
    .map((r) => r.trim())
    .filter((r) => r !== '');

function failure(error: ApiFailure): string {
  if (error.kind === 'network') return 'Linking needs a connection.';
  if (error.kind === 'invalid_response')
    return 'This app is out of date for the server. Update the app.';
  return error.message;
}

/** The token goes to the server once and is never kept on the phone (ADR 0015). */
export function GithubScreen() {
  const c = usePalette();
  const bottomPadding = useBottomPadding();
  const { services } = useApp();
  const [link, setLink] = useState<GithubLink | null>(null);
  const [token, setToken] = useState('');
  const [reposText, setReposText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void services.api.getGithubLink().then((r) => {
      if (r.ok) setLink(r.data);
    });
  }, [services]);

  const repos = reposOf(reposText);
  const reposValid =
    repos.length >= 1 &&
    repos.length <= MAX_REPOS &&
    new Set(repos).size === repos.length &&
    repos.every((r) => RepoNameSchema.safeParse(r).success);
  const valid = token.trim().length >= 20 && reposValid;

  const connect = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await services.api.linkGithub({ token: token.trim(), repos });
      if (!result.ok) {
        setMessage(failure(result.error));
        return;
      }
      setToken(''); // never kept
      setLink(result.data);
    } finally {
      setBusy(false);
    }
  };

  const unlink = () =>
    Alert.alert('Unlink GitHub?', "GitHub tasks can't be checked until you link again.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unlink',
        style: 'destructive',
        onPress: () =>
          void services.api.unlinkGithub().then((r) => {
            if (r.ok) setLink(null);
            else setMessage(failure(r.error));
          }),
      },
    ]);

  const input = [
    styles.input,
    { color: c.text, borderColor: c.border, backgroundColor: c.surface },
  ];
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.body, bottomPadding]}
      keyboardShouldPersistTaps="handled"
    >
      {message !== null && <Banner tone="warning" message={message} />}
      {link !== null ? (
        <>
          <Text style={[styles.title, { color: c.text }]}>Linked as {link.login}</Text>
          {link.status === 'invalid' && (
            <Banner tone="danger" message="Reconnect GitHub: the token no longer works." />
          )}
          {link.repos.map((r) => (
            <Text key={r} style={[styles.muted, { color: c.text }]}>
              {r}
              {link.unreadableRepos.includes(r) ? " can't be read with this token" : ''}
            </Text>
          ))}
          <Button
            testID="unlink-github"
            label="Unlink GitHub"
            variant="secondary"
            onPress={unlink}
          />
        </>
      ) : (
        <>
          <Text style={[styles.muted, { color: c.muted }]}>
            Use a fine-grained, read-only token (Contents and Metadata). Only commits on each
            repo&apos;s default branch, made with your GitHub account&apos;s email, count.
          </Text>
          <Text style={[styles.label, { color: c.text }]}>Token</Text>
          <TextInput
            testID="github-token"
            accessibilityLabel="GitHub token"
            value={token}
            onChangeText={setToken}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={input}
          />
          <Text style={[styles.label, { color: c.text }]}>
            Repositories (owner/name, one per line)
          </Text>
          <TextInput
            testID="github-repos"
            accessibilityLabel="Repositories"
            value={reposText}
            onChangeText={setReposText}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            style={[input, styles.repos]}
          />
          <Button
            testID="link-github"
            label={busy ? 'Linking…' : 'Link GitHub'}
            disabled={busy || !valid}
            onPress={() => void connect()}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, gap: space.md },
  title: { fontSize: 18, fontWeight: '600' },
  muted: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 15, fontWeight: '600' },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 16,
  },
  repos: { minHeight: 96, textAlignVertical: 'top' },
});
