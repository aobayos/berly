// One character, several names. A writer may cue the same person by their
// true name or their hero name; the Bible says which names belong together,
// and everything that counts characters (the Bible, its stats, the reports)
// asks this module who a cue really is.
//
// Screenwriting convention has no tool for this — pros keep one cue name and
// mark a reveal with a slash ("KEVIN/HERO TOO"). Both are honoured: aliases
// from the Bible, and a slash cue counts as the first of its names that the
// Bible knows, or simply its first name.
import type { BibleEntry } from '@/model/types';
import { characterName } from '@/services/suggestions';
import { isSheetEmpty } from '@/services/characterSheet';

/** Cue text or name → the character it stands for. */
export type ResolveName = (name: string) => string;

export function characterResolver(bible: BibleEntry[]): ResolveName {
  const canonical = new Map<string, string>();
  for (const entry of bible) {
    if (entry.kind !== 'character') continue;
    canonical.set(entry.name, entry.name);
    for (const alias of entry.aliases ?? []) canonical.set(alias, entry.name);
  }

  return (cue) => {
    const name = characterName(cue);
    const known = canonical.get(name);
    if (known) return known;
    if (!name.includes('/')) return name;
    const parts = name
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean);
    for (const part of parts) {
      const match = canonical.get(part);
      if (match) return match;
    }
    return parts[0] ?? name;
  };
}

/** With no Bible to consult: only the slash convention applies. */
export const plainResolver: ResolveName = characterResolver([]);

/** An entry with nothing written in it: no sheet answers, note or aliases.
 * One of those can be folded into another character as an alias; an entry
 * the writer has filled in can't, or their work would be orphaned. */
export function isBlankEntry(entry: BibleEntry): boolean {
  return isSheetEmpty(entry.sheet) && !entry.note.trim() && !entry.aliases?.length;
}

/** Every alias in the Bible, for autocomplete: either name can be typed. */
export function characterAliases(bible: BibleEntry[]): string[] {
  return bible.flatMap((entry) => (entry.kind === 'character' ? (entry.aliases ?? []) : []));
}

/** Why `alias` can't be added to `owner`, or null when it can: it must not be
 * the owner's own name, another character's name, or another's alias. */
export function aliasConflict(
  bible: BibleEntry[],
  owner: string,
  alias: string
): { kind: 'self' } | { kind: 'name' | 'alias'; other: string } | null {
  if (alias === owner) return { kind: 'self' };
  for (const entry of bible) {
    if (entry.kind !== 'character' || entry.name === owner) continue;
    if (entry.name === alias && !isBlankEntry(entry)) return { kind: 'name', other: entry.name };
    if (entry.aliases?.includes(alias)) return { kind: 'alias', other: entry.name };
  }
  return null;
}
