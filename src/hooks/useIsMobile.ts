import { useEffect, useState } from 'react';

// Same cutoff as App.css's mobile @media block — keep the two in sync, this
// is what drives the sequencer's squish (everything else stacks via pure CSS
// and doesn't need JS to know the viewport size).
const QUERY = '(max-width: 640px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
