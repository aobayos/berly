// Recent-project tracking. Two things happen when a project is opened:
// the path is handed to the OS (app.addRecentDocument → Windows Jump List /
// macOS "Open Recent"), and a richer entry is kept in our own JSON store so
// the in-app Open dialog can show names, kinds and timestamps that the OS
// list can't carry.
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

export interface RecentEntry {
  id: string;
  name: string;
  kind: 'movie' | 'show';
  path: string;
  openedAt: number;
}

const MAX_RECENTS = 20;

function storePath(): string {
  return path.join(app.getPath('userData'), 'recents.json');
}

export function readRecents(): RecentEntry[] {
  try {
    const raw = JSON.parse(fs.readFileSync(storePath(), 'utf-8')) as unknown;
    if (!Array.isArray(raw)) return [];
    return (raw as RecentEntry[])
      .filter((e) => e && typeof e.id === 'string' && typeof e.path === 'string')
      .sort((a, b) => b.openedAt - a.openedAt);
  } catch {
    return [];
  }
}

function writeRecents(entries: RecentEntry[]): void {
  try {
    fs.writeFileSync(storePath(), JSON.stringify(entries.slice(0, MAX_RECENTS)));
  } catch {
    // A missing recents file is never worth failing an open over.
  }
}

export function addRecent(entry: Omit<RecentEntry, 'openedAt'>): void {
  const rest = readRecents().filter((e) => e.id !== entry.id);
  writeRecents([{ ...entry, openedAt: Date.now() }, ...rest]);
  // Only real, existing files are accepted here — Windows silently drops
  // Jump List entries that don't resolve, and macOS shows dead entries.
  if (fs.existsSync(entry.path)) app.addRecentDocument(entry.path);
}

export function removeRecent(id: string): void {
  writeRecents(readRecents().filter((e) => e.id !== id));
}

export function clearRecents(): void {
  writeRecents([]);
  app.clearRecentDocuments();
}

/** Drops entries whose backing file has since been deleted (a project
 * removed from the project list, or a userData wipe). */
export function pruneRecents(): RecentEntry[] {
  const live = readRecents().filter((e) => fs.existsSync(e.path));
  writeRecents(live);
  return live;
}
