// Pure project-JSON validation/upgrade logic, shared between the web
// backend (storage.web.ts) and the Electron main process (electron/main.ts)
// — no localStorage or DOM dependency, so it works in both.
import type {
  BibleEntry,
  Project,
  Script,
  ScriptElement,
  SheetSection,
  SheetTemplates,
} from './types';
import { newId } from './types';

/** Accepts both the current format and the original v1 format (elements
 * directly on the project) and returns a valid current-format project. */
export function migrate(data: unknown): Project | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.name !== 'string') return null;
  const now = Date.now();

  // v1: { elements: [...] } — wrap into a single-script movie.
  if (Array.isArray(d.elements) && !Array.isArray(d.scripts)) {
    if (!validElements(d.elements)) return null;
    return {
      id: typeof d.id === 'string' ? d.id : newId(),
      kind: 'movie',
      name: d.name,
      titlePage: normalizeTitlePage(d),
      scripts: [
        {
          id: newId(),
          name: d.name,
          elements: d.elements as ScriptElement[],
          createdAt: (d.createdAt as number) ?? now,
          updatedAt: (d.updatedAt as number) ?? now,
        },
      ],
      bible: normalizeBible(d),
      createdAt: (d.createdAt as number) ?? now,
      updatedAt: (d.updatedAt as number) ?? now,
    };
  }

  if (!Array.isArray(d.scripts)) return null;
  const scripts = d.scripts as Script[];
  if (
    !scripts.every(
      (s) =>
        typeof s?.name === 'string' &&
        Array.isArray(s?.elements) &&
        validElements(s.elements)
    )
  ) {
    return null;
  }
  return {
    id: typeof d.id === 'string' ? d.id : newId(),
    kind: d.kind === 'show' ? 'show' : 'movie',
    name: d.name,
    titlePage: normalizeTitlePage(d),
    scripts,
    bible: normalizeBible(d),
    sheetTemplates: normalizeTemplates(d),
    createdAt: (d.createdAt as number) ?? now,
    updatedAt: (d.updatedAt as number) ?? now,
  };
}

function validElements(elements: unknown[]): boolean {
  return elements.every(
    (el) =>
      typeof (el as ScriptElement)?.text === 'string' &&
      typeof (el as ScriptElement)?.type === 'string'
  );
}

function normalizeTitlePage(d: Record<string, unknown>): Project['titlePage'] {
  const tp = (d.titlePage ?? {}) as Partial<Project['titlePage']>;
  return {
    title: tp.title ?? (d.name as string),
    credit: tp.credit ?? '',
    author: tp.author ?? '',
    contact: tp.contact ?? '',
    draftDate: tp.draftDate ?? '',
  };
}

/** Accepts the current { name, kind, note }[] shape, and the original
 * { [name]: note } shape (every entry was implicitly a character then). */
function normalizeBible(d: Record<string, unknown>): BibleEntry[] {
  const raw = d.bible;

  if (Array.isArray(raw)) {
    return raw
      .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
      .map((e) => ({
        name: typeof e.name === 'string' ? e.name : '',
        kind: e.kind === 'location' ? ('location' as const) : ('character' as const),
        note: typeof e.note === 'string' ? e.note : '',
        sheet: normalizeSections(e.sheet),
      }))
      .filter((e) => e.name);
  }

  if (typeof raw === 'object' && raw !== null) {
    return Object.entries(raw as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([name, note]) => ({ name, kind: 'character' as const, note }));
  }

  return [];
}

/** Sheets arrived after the Bible did, so every entry written before then has
 * none — undefined is the normal case, not a fault. Anything malformed is
 * dropped rather than rejected: a broken sheet must not cost the writer the
 * screenplay it was attached to. */
function normalizeSections(raw: unknown): SheetSection[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const sections = raw
    .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
    .map((s) => ({
      id: typeof s.id === 'string' ? s.id : newId(),
      // Absent on a heading the writer has renamed — that is the signal to
      // show their text rather than the dictionary's.
      titleKey: typeof s.titleKey === 'string' ? s.titleKey : undefined,
      title: typeof s.title === 'string' ? s.title : '',
      fields: Array.isArray(s.fields)
        ? s.fields
            .filter(
              (f): f is Record<string, unknown> => typeof f === 'object' && f !== null
            )
            .map((f) => ({
              id: typeof f.id === 'string' ? f.id : newId(),
              labelKey: typeof f.labelKey === 'string' ? f.labelKey : undefined,
              label: typeof f.label === 'string' ? f.label : '',
              value: typeof f.value === 'string' ? f.value : '',
              multiline: f.multiline === true,
            }))
        : [],
    }));

  return sections.length > 0 ? sections : undefined;
}

function normalizeTemplates(d: Record<string, unknown>): SheetTemplates | undefined {
  const raw = d.sheetTemplates;
  if (typeof raw !== 'object' || raw === null) return undefined;
  const templates = raw as Record<string, unknown>;
  const character = normalizeSections(templates.character);
  const location = normalizeSections(templates.location);
  if (!character && !location) return undefined;
  return { character: character ?? [], location: location ?? [] };
}
