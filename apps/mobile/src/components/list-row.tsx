import { Children, Fragment, type ReactNode } from 'react';
import { StyleSheet, Text, View, type ColorValue } from 'react-native';
import { radius, space, usePalette } from '@/theme';
import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';

/** Rows grouped on one surface with hairlines between them, instead of a card per row. */
export function ListGroup({ title, children }: Readonly<{ title?: string; children: ReactNode }>) {
  const c = usePalette();
  const rows = Children.toArray(children);
  return (
    <View style={styles.group}>
      {title !== undefined && (
        <Text accessibilityRole="header" style={[styles.groupTitle, { color: c.muted }]}>
          {title}
        </Text>
      )}
      <View style={[styles.surface, { backgroundColor: c.surface, borderColor: c.border }]}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <View style={[styles.hairline, { backgroundColor: c.border }]} />}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

type RowProps = Readonly<{
  title: string;
  detail?: string;
  icon?: IconName;
  /** Tint of the icon and its soft square; the accent by default. */
  tint?: ColorValue;
  tintSoft?: ColorValue;
  /** Shown at the end of the row; a chevron when the row opens something and has no trailing. */
  trailing?: ReactNode;
  /** Extra content under the text, such as an action button. */
  children?: ReactNode;
  onPress?: () => void;
  testID?: string;
}>;

export function ListRow({
  title,
  detail,
  icon,
  tint,
  tintSoft,
  trailing,
  children,
  onPress,
  testID,
}: RowProps) {
  const c = usePalette();
  const body = (
    <View style={styles.row}>
      <View style={styles.line}>
        {icon !== undefined && (
          <View style={[styles.badge, { backgroundColor: tintSoft ?? c.accentSoft }]}>
            <Icon name={icon} color={tint ?? c.accentSoftText} size={22} />
          </View>
        )}
        <View style={styles.text}>
          <Text style={[styles.title, { color: c.text }]}>{title}</Text>
          {detail !== undefined && (
            <Text style={[styles.detail, { color: c.muted }]}>{detail}</Text>
          )}
        </View>
        {trailing ??
          (onPress !== undefined && <Icon name="chevron-right" color={c.muted} size={24} />)}
      </View>
      {children}
    </View>
  );
  if (onPress === undefined) {
    return <View testID={testID}>{body}</View>;
  }
  return (
    <PressableScale testID={testID} onPress={onPress} pressedScale={0.985}>
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  groupTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: space.xs,
  },
  surface: {
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    overflow: 'hidden',
  },
  hairline: { height: StyleSheet.hairlineWidth, marginLeft: space.md },
  row: { padding: space.md, gap: space.md, minHeight: 56 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '700' },
  detail: { fontSize: 14, lineHeight: 20 },
});
