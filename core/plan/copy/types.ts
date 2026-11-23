/** Types shared by the plan's copy modules. */
import type { Text } from '../../copy/text.js';

export type TipCopy = Readonly<Record<'title' | 'detail' | 'explanation', Text>>;
