import { Dimensions } from 'react-native';
import { breakpoints } from './tokens';

export type LayoutSize = 'phoneSmall' | 'phoneNormal' | 'tablet';

export const getLayoutSize = (): LayoutSize => {
  const { width } = Dimensions.get('window');
  if (width < breakpoints.phoneSmall) return 'phoneSmall';
  if (width < breakpoints.tablet) return 'phoneNormal';
  return 'tablet';
};
