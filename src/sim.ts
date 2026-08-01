import { Network } from './engine/network';

// Single mutable holder for the live engine instance so the store,
// terminal sessions and components can share it without import cycles.
export const sim = {
  net: new Network(),
};
