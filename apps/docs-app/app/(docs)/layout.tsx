import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { source } from '@/lib/source';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      nav={{ title: 'Commiq' }}
      links={[
        {
          text: 'Examples',
          url: 'https://naikidev.github.io/commiq/',
        },
        {
          text: 'GitHub',
          url: 'https://github.com/naikidev/commiq',
        },
      ]}
    >
      {children}
    </DocsLayout>
  );
}
