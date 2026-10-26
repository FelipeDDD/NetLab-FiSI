import { useEffect, useRef } from 'react';
import { registerPendingForm } from './pendingForms';

export function usePendingForm(check: () => boolean): void {
  const latest = useRef(check); latest.current = check;
  useEffect(() => registerPendingForm(() => latest.current()), []);
}
