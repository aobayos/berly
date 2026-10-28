// The Bible's edits as plain project → project functions. The editor wraps
// them in its undo history, the project page in a debounced save; neither
// owns the rules about how an entry is created or changed.
import type { BibleKind, Project, SheetSection, TitlePage } from '@/model/types';
import { builtInTemplates, toTemplate } from '@/services/characterSheet';

function touched(project: Project, change: Partial<Project>): Project {
  return { ...project, ...change, updatedAt: Date.now() };
}

/** Changes one entry, creating it first when the writer is filling in a name
 * that so far only exists in the script. */
function withEntry(
  project: Project,
  name: string,
  kind: BibleKind,
  change: { note?: string; sheet?: SheetSection[] }
): Project {
  const exists = project.bible.some((b) => b.name === name && b.kind === kind);
  const bible = exists
    ? project.bible.map((b) => (b.name === name && b.kind === kind ? { ...b, ...change } : b))
    : [...project.bible, { name, kind, note: '', ...change }];
  return touched(project, { bible });
}

export function setBibleNote(
  project: Project,
  name: string,
  kind: BibleKind,
  note: string
): Project {
  return withEntry(project, name, kind, { note });
}

export function setBibleSheet(
  project: Project,
  name: string,
  kind: BibleKind,
  sheet: SheetSection[]
): Project {
  return withEntry(project, name, kind, { sheet });
}

/** Names are stored upper case, as cues and headings are. A name already in
 * the Bible is left alone. */
export function addBibleEntry(project: Project, name: string, kind: BibleKind): Project {
  const normalized = name.trim().toUpperCase();
  if (!normalized) return project;
  if (project.bible.some((b) => b.name === normalized && b.kind === kind)) return project;
  return touched(project, { bible: [...project.bible, { name: normalized, kind, note: '' }] });
}

export function removeBibleEntry(project: Project, name: string, kind: BibleKind): Project {
  return touched(project, {
    bible: project.bible.filter((b) => !(b.name === name && b.kind === kind)),
  });
}

/** Promotes a sheet's layout — its sections and labels, without the answers —
 * to the shape new sheets of that kind start from. */
export function saveSheetTemplate(
  project: Project,
  kind: BibleKind,
  sheet: SheetSection[]
): Project {
  const current = project.sheetTemplates ?? builtInTemplates();
  return touched(project, { sheetTemplates: { ...current, [kind]: toTemplate(sheet) } });
}

export function setTitlePage(project: Project, titlePage: TitlePage): Project {
  return touched(project, { titlePage });
}
