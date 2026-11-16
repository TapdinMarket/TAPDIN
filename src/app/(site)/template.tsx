import type { ReactNode } from 'react';

/** Re-mounts on every navigation, so each page fades in with the same motion. */
export default function SiteTemplate({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
