import LegalPage from '../components/LegalPage';
import { privacyContent, termsContent } from '../lib/legal-content';

// Layout lives in components/LegalPage.js — this page is only the binding.
export default function Privacy() {
  return (
    <LegalPage
      content={privacyContent}
      sibling={{ href: '/terms', content: termsContent }}
    />
  );
}
