import { Suspense } from 'react';
import { StickyNotesWorkspace } from '@/components/sticky-notes-workspace';

export default function DashboardStickyNotesPage() {
  return (
    <Suspense fallback={null}>
      <StickyNotesWorkspace />
    </Suspense>
  );
}
