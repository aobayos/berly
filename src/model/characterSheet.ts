// Character and location sheets: the structure, and the sheet a new entry
// starts from.
//
// Nothing here is fixed. Sections and fields are ordinary project data, so
// the writer can rename, reorder, add and delete any of them — a series bible
// needs rows a one-off film never will. What follows is only a first draft of
// a sheet, built from the questions screenwriting craft keeps coming back to
// (what a character wants against what they need, the flaw in the way, the
// arc between the two).
//
// The built-in headings are stored as dictionary keys rather than text, so
// they follow the EN/FR switch like the rest of the UI. The moment the writer
// renames one it becomes their words and is stored verbatim — see
// SheetField.labelKey in types.ts.
import type { BibleKind, SheetField, SheetSection, SheetTemplates } from './types';
import { newId } from './types';
import type { Dict } from '../i18n';

function field(labelKey: string, multiline = false): SheetField {
  return { id: newId(), labelKey, label: '', value: '', multiline };
}

function section(titleKey: string, fields: SheetField[]): SheetSection {
  return { id: newId(), titleKey, title: '', fields };
}

/** The heading to show: the dictionary entry while the built-in key is
 * intact, the writer's own text once they've renamed it. */
function resolveLabel(key: string | undefined, own: string, t: Dict): string {
  if (!key) return own;
  const translated = (t as unknown as Record<string, unknown>)[key];
  return typeof translated === 'string' ? translated : own;
}

export function fieldLabel(field: SheetField, t: Dict): string {
  return resolveLabel(field.labelKey, field.label, t);
}

export function sectionTitle(section: SheetSection, t: Dict): string {
  return resolveLabel(section.titleKey, section.title, t);
}

export function builtInCharacterSheet(): SheetSection[] {
  return [
    section('sheetSecIdentity', [
      field('sheetFieldFullName'),
      field('sheetFieldAge'),
      field('sheetFieldRole'),
      field('sheetFieldOccupation'),
    ]),
    section('sheetSecDrama', [
      field('sheetFieldWant', true),
      field('sheetFieldNeed', true),
      field('sheetFieldFlaw', true),
      field('sheetFieldObstacle', true),
      field('sheetFieldArc', true),
    ]),
    section('sheetSecVoice', [
      field('sheetFieldVoice', true),
      field('sheetFieldAppearance', true),
    ]),
    section('sheetSecBackstory', [
      field('sheetFieldBackstory', true),
      field('sheetFieldRelationships', true),
    ]),
  ];
}

export function builtInLocationSheet(): SheetSection[] {
  return [
    section('sheetSecPlace', [
      field('sheetFieldKind'),
      field('sheetFieldWhere'),
      field('sheetFieldDescription', true),
    ]),
    section('sheetSecAtmosphere', [
      field('sheetFieldMood', true),
      field('sheetFieldStory', true),
    ]),
  ];
}

export function builtInTemplates(): SheetTemplates {
  return {
    character: builtInCharacterSheet(),
    location: builtInLocationSheet(),
  };
}

/** A fresh copy of the layout new sheets start from — the project's own
 * template once the writer has saved one, otherwise the built-in sheet. Ids
 * are regenerated so two sheets never share a field. */
export function newSheet(
  kind: BibleKind,
  templates: SheetTemplates | undefined
): SheetSection[] {
  return cloneSections(templates?.[kind] ?? builtInTemplates()[kind]);
}

/** Structure without values — what "use this layout for new sheets" keeps.
 * Translation keys survive, so a template built from the standard sheet stays
 * bilingual. */
export function toTemplate(sections: SheetSection[]): SheetSection[] {
  return sections.map((s) => ({
    ...s,
    id: newId(),
    fields: s.fields.map((f) => ({ ...f, id: newId(), value: '' })),
  }));
}

function cloneSections(sections: SheetSection[]): SheetSection[] {
  return sections.map((s) => ({
    ...s,
    id: newId(),
    fields: s.fields.map((f) => ({ ...f, id: newId() })),
  }));
}

export function newSection(title: string): SheetSection {
  return { id: newId(), title, fields: [{ id: newId(), label: '', value: '' }] };
}

export function newField(label: string): SheetField {
  return { id: newId(), label, value: '', multiline: false };
}

/** True when nothing has been filled in — used to decide whether a sheet is
 * worth marking as "started" in the list. */
export function isSheetEmpty(sections: SheetSection[] | undefined): boolean {
  return !sections?.some((s) => s.fields.some((f) => f.value.trim()));
}

/** Moves an item within an array, clamped — shared by the section and field
 * reorder buttons. */
export function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
