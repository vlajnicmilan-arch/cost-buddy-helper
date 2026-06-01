/**
 * Default split behavior suggested by relationship tag.
 * UI-only hints — actual split mode and per-member overrides still apply.
 */
import type { FamilyRelationship } from '@/hooks/useFamilyMemberConsent';
import type { FamilySplitMode } from './familySplitSuggestion';

export interface RelationshipDefault {
  /** Recommend excluding this member from the split entirely (e.g. minor child). */
  excludeFromSplit: boolean;
  /** Preferred mode when starting a group with this relationship dominant. */
  preferredMode: FamilySplitMode;
}

export function getRelationshipDefault(rel: FamilyRelationship | null | undefined): RelationshipDefault {
  switch (rel) {
    case 'child':
      return { excludeFromSplit: true, preferredMode: 'equal' };
    case 'parent':
    case 'grandparent':
      return { excludeFromSplit: false, preferredMode: 'proportional_income' };
    case 'partner':
      return { excludeFromSplit: false, preferredMode: 'proportional_income' };
    case 'roommate':
    case 'sibling':
      return { excludeFromSplit: false, preferredMode: 'equal' };
    default:
      return { excludeFromSplit: false, preferredMode: 'equal' };
  }
}

export const RELATIONSHIP_OPTIONS: FamilyRelationship[] = [
  'partner',
  'child',
  'parent',
  'sibling',
  'roommate',
  'grandparent',
  'other',
];
