import { ReactNode } from 'react';

/**
 * Standardna širina sadržaja za pune ekrane.
 *
 * Isti obrazac koji već koriste Home (`PersonalModeView`), Projekti, Budžeti i
 * Novčanik: `max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8`. Svaki novi puni
 * ekran MORA ići kroz ovaj omotač — inače sadržaj bježi od ruba do ruba na
 * širokim monitorima. Čuvar test: `src/test/pageContainerUsage.test.ts`.
 */
export const PAGE_CONTAINER_CLASS = 'max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-8';

interface PageContainerProps {
  children: ReactNode;
  /** Dodatne klase; širina i centriranje ostaju iz standarda. */
  className?: string;
  /** Bez okomitog razmaka (npr. kad roditelj već ima padding). */
  noVerticalPadding?: boolean;
  as?: 'div' | 'main' | 'section';
}

export const PageContainer = ({
  children,
  className = '',
  noVerticalPadding = false,
  as: Tag = 'div',
}: PageContainerProps) => {
  const base = noVerticalPadding
    ? 'max-w-4xl mx-auto px-3 sm:px-4'
    : PAGE_CONTAINER_CLASS;
  return <Tag className={`${base} ${className}`.trim()}>{children}</Tag>;
};
