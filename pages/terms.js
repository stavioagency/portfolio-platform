import LegalPage from '../components/LegalPage';
import { termsContent, privacyContent } from '../lib/legal-content';

// Layout lives in components/LegalPage.js — this page is only the binding.
export default function Terms() {
  return (
    <LegalPage
      content={termsContent}
      sibling={{ href: '/privacy', content: privacyContent }}
    />
  );
}
