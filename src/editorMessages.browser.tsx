// Test-only presentation mount; absent from production entry points/build.
import { createRoot } from 'react-dom/client';
import { PersistenceStatus } from './components/PersistenceStatus';

export function mountLegacyMessageReview(element: HTMLElement) {
  if (location.pathname !== '/__application_boot_test__') throw Error('Disposable message review route required.');
  const root = createRoot(element);
  root.render(<PersistenceStatus />);
  return root;
}
