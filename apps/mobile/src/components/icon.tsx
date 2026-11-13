import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

export type IconName = ComponentProps<typeof MaterialIcons>['name'];

type IconProps = Readonly<{
  name: IconName;
  color: ColorValue;
  size?: number;
  /** Only for an icon that stands alone; next to text the icon is decoration and stays hidden. */
  label?: string;
}>;

/** Material icons only: this is an Android app, and one icon family keeps the screens consistent. */
export function Icon({ name, color, size = 24, label }: IconProps) {
  return (
    <MaterialIcons
      name={name}
      size={size}
      color={color as string}
      accessible={label !== undefined}
      accessibilityLabel={label}
      accessibilityElementsHidden={label === undefined}
      importantForAccessibility={label === undefined ? 'no-hide-descendants' : 'yes'}
    />
  );
}
