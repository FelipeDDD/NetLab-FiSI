// No app/engine/bootstrap imports. Not an HTML production entry or public navigation target.
import { createRoot } from 'react-dom/client';
import '../../themes.css';
import '../../styles.css';
import '../../buttons.css';

if(import.meta.env.DEV&&location.pathname==='/__diagnosis_preview__') {
  const {default:DiagnosisPreview}=await import('./DiagnosisPreview');
  createRoot(document.getElementById('root')!).render(<DiagnosisPreview />);
}
