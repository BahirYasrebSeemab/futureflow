import { router } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { useBottomPadding } from '@/components/bottom-padding';
import type { IconName } from '@/components/icon';
import { ListGroup, ListRow } from '@/components/list-row';
import { space, usePalette } from '@/theme';

type Row = readonly [testID: string, href: string, title: string, detail: string, icon: IconName];

const GROUPS: readonly [string, readonly Row[]][] = [
  [
    'Your goals',
    [
      [
        'more-roadmap',
        '/roadmap',
        'Roadmap',
        'Who you want to become, your skills and milestones',
        'flag',
      ],
      [
        'more-reading',
        '/reading',
        'Reading log',
        'Log what you read and what you learned',
        'menu-book',
      ],
      [
        'more-github',
        '/github',
        'GitHub',
        'Link the repos your coding tasks are checked against',
        'code',
      ],
    ],
  ],
  [
    'Phone',
    [
      ['more-guard', '/guard', 'Guard', 'Block apps when your time runs out', 'shield'],
      [
        'more-diagnostics',
        '/diagnostics',
        'Diagnostics',
        'Sync status and what is waiting to send',
        'insights',
      ],
    ],
  ],
];

export function MoreScreen() {
  const c = usePalette();
  const bottomPadding = useBottomPadding();
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.body, bottomPadding]}
    >
      {GROUPS.map(([title, rows]) => (
        <ListGroup key={title} title={title}>
          {rows.map(([testID, href, rowTitle, detail, icon]) => (
            <ListRow
              key={testID}
              testID={testID}
              title={rowTitle}
              detail={detail}
              icon={icon}
              onPress={() => router.push(href as never)}
            />
          ))}
        </ListGroup>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.md, gap: space.lg },
});
