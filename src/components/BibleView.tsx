// The project Bible: every character and location on the left, that entry's
// full sheet on the right.
//
// A sheet is not a fixed form. Sections and fields are the writer's own —
// renamed, reordered, added and deleted here — and any sheet's layout can be
// promoted to the template new sheets start from, which is what makes this
// usable for a series bible rather than a one-off form.
import { useMemo, useState } from 'react';
import type {
  BibleEntry,
  BibleKind,
  Project,
  Script,
  SheetSection,
} from '../types';
import { extractCharacters, extractPlaces } from '../suggestions';
import { aggregateCharacterStats, characterStats } from '../characterStats';
import {
  isSheetEmpty,
  move,
  newField,
  newSection,
  newSheet,
  fieldLabel,
  sectionTitle,
} from '../characterSheet';
import { useI18n } from '../i18n';

interface Props {
  project: Project;
  script: Script;
  onNoteChange: (name: string, kind: BibleKind, note: string) => void;
  onSheetChange: (name: string, kind: BibleKind, sheet: SheetSection[]) => void;
  onSaveTemplate: (kind: BibleKind, sheet: SheetSection[]) => void;
  onAdd: (name: string, kind: BibleKind) => void;
  onRemove: (name: string, kind: BibleKind) => void;
  onJump: (elementId: string) => void;
}

interface Row {
  name: string;
  kind: BibleKind;
  meta: string;
  started: boolean;
  firstElementId?: string;
}

interface Selection {
  name: string;
  kind: BibleKind;
}

export default function BibleView({
  project,
  script,
  onNoteChange,
  onSheetChange,
  onSaveTemplate,
  onAdd,
  onRemove,
  onJump,
}: Props) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<Selection | null>(null);
  const [newCharacter, setNewCharacter] = useState('');
  const [newLocation, setNewLocation] = useState('');

  const entry = (name: string, kind: BibleKind): BibleEntry | undefined =>
    project.bible.find((b) => b.name === name && b.kind === kind);

  const characterRows = useMemo<Row[]>(() => {
    const names = new Set<string>([
      ...extractCharacters(project.scripts),
      ...project.bible.filter((b) => b.kind === 'character').map((b) => b.name),
    ]);
    const totals = aggregateCharacterStats(project.scripts);
    const currentStats = characterStats(script.elements);
    return [...names].sort().map((name) => {
      const total = totals.get(name);
      const current = currentStats.find((c) => c.name === name);
      const meta =
        total && total.sceneCount > 0
          ? `${total.sceneCount} ${total.sceneCount === 1 ? t.scene : t.scenes} · ${total.dialogueCount} ${total.dialogueCount === 1 ? t.line : t.lines}`
          : t.notUsedYet;
      return {
        name,
        kind: 'character' as const,
        meta,
        started: !isSheetEmpty(
          project.bible.find((b) => b.name === name && b.kind === 'character')?.sheet
        ),
        firstElementId: current?.firstElementId,
      };
    });
  }, [project, script, t]);

  const locationRows = useMemo<Row[]>(() => {
    const names = new Set<string>([
      ...extractPlaces(project.scripts),
      ...project.bible.filter((b) => b.kind === 'location').map((b) => b.name),
    ]);
    const usedInCurrentScript = new Set(extractPlaces([script]));
    return [...names].sort().map((name) => ({
      name,
      kind: 'location' as const,
      meta: usedInCurrentScript.has(name) ? '' : t.notUsedYet,
      started: !isSheetEmpty(
        project.bible.find((b) => b.name === name && b.kind === 'location')?.sheet
      ),
    }));
  }, [project, script, t]);

  const selectedRow =
    selected &&
    [...characterRows, ...locationRows].find(
      (r) => r.name === selected.name && r.kind === selected.kind
    );

  function handleAdd(name: string, kind: BibleKind) {
    const normalized = name.trim().toUpperCase();
    if (!normalized) return;
    onAdd(normalized, kind);
    setSelected({ name: normalized, kind });
  }

  function handleRemove(name: string, kind: BibleKind) {
    onRemove(name, kind);
    if (selected?.name === name && selected.kind === kind) setSelected(null);
  }

  return (
    <div className="bible-page bible-split">
      <aside className="bible-index">
        <IndexSection
          heading={t.bibleCharacters}
          emptyLabel={t.noCharacters}
          addPlaceholder={t.newCharacterPlaceholder}
          addLabel={t.addCharacter}
          newValue={newCharacter}
          onNewValueChange={setNewCharacter}
          rows={characterRows}
          selected={selected}
          onSelect={setSelected}
          onAdd={(name) => {
            handleAdd(name, 'character');
            setNewCharacter('');
          }}
        />
        <IndexSection
          heading={t.bibleLocations}
          emptyLabel={t.noLocations}
          addPlaceholder={t.newLocationPlaceholder}
          addLabel={t.addLocation}
          newValue={newLocation}
          onNewValueChange={setNewLocation}
          rows={locationRows}
          selected={selected}
          onSelect={setSelected}
          onAdd={(name) => {
            handleAdd(name, 'location');
            setNewLocation('');
          }}
        />
      </aside>

      {selected && selectedRow ? (
        <SheetEditor
          key={`${selected.kind}:${selected.name}`}
          project={project}
          row={selectedRow}
          entry={entry(selected.name, selected.kind)}
          onNoteChange={onNoteChange}
          onSheetChange={onSheetChange}
          onSaveTemplate={onSaveTemplate}
          onRemove={handleRemove}
          onJump={onJump}
        />
      ) : (
        <section className="bible-detail bible-detail-empty">
          <p className="side-empty">{t.sheetEmpty}</p>
        </section>
      )}
    </div>
  );
}

function IndexSection({
  heading,
  emptyLabel,
  addPlaceholder,
  addLabel,
  newValue,
  onNewValueChange,
  rows,
  selected,
  onSelect,
  onAdd,
}: {
  heading: string;
  emptyLabel: string;
  addPlaceholder: string;
  addLabel: string;
  newValue: string;
  onNewValueChange: (value: string) => void;
  rows: Row[];
  selected: Selection | null;
  onSelect: (selection: Selection) => void;
  onAdd: (name: string) => void;
}) {
  return (
    <section className="bible-index-section">
      <h2 className="bible-heading">{heading}</h2>
      <div className="bible-add-row">
        <input
          className="bible-add-input"
          value={newValue}
          placeholder={addPlaceholder}
          onChange={(e) => onNewValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAdd(newValue);
            }
          }}
        />
        <button
          type="button"
          className="btn btn-small btn-primary"
          title={addLabel}
          onClick={() => onAdd(newValue)}
        >
          +
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="side-empty">{emptyLabel}</p>
      ) : (
        <ul className="bible-index-list">
          {rows.map((row) => {
            const isSelected =
              selected?.name === row.name && selected.kind === row.kind;
            return (
              <li key={row.name}>
                <button
                  type="button"
                  className={`bible-index-item ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => onSelect({ name: row.name, kind: row.kind })}
                >
                  <span className="bible-index-name">
                    {row.name}
                    {row.started && (
                      <span className="bible-index-dot" aria-hidden>
                        ●
                      </span>
                    )}
                  </span>
                  {row.meta && <span className="char-meta">{row.meta}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SheetEditor({
  project,
  row,
  entry,
  onNoteChange,
  onSheetChange,
  onSaveTemplate,
  onRemove,
  onJump,
}: {
  project: Project;
  row: Row;
  entry: BibleEntry | undefined;
  onNoteChange: (name: string, kind: BibleKind, note: string) => void;
  onSheetChange: (name: string, kind: BibleKind, sheet: SheetSection[]) => void;
  onSaveTemplate: (kind: BibleKind, sheet: SheetSection[]) => void;
  onRemove: (name: string, kind: BibleKind) => void;
  onJump: (elementId: string) => void;
}) {
  const { t } = useI18n();
  const [templateSaved, setTemplateSaved] = useState(false);

  // An entry the writer has never opened has no sheet yet; it is seeded from
  // the template for display and only stored once they type something, so
  // merely browsing the Bible doesn't fill the project with blank sheets.
  const sections = useMemo(
    () => entry?.sheet ?? newSheet(row.kind, project.sheetTemplates),
    // Seeding must not re-run on every keystroke elsewhere in the project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entry?.sheet, row.kind, row.name]
  );

  const update = (next: SheetSection[]) => onSheetChange(row.name, row.kind, next);

  const updateSection = (index: number, fn: (s: SheetSection) => SheetSection) =>
    update(sections.map((s, i) => (i === index ? fn(s) : s)));

  return (
    <section className="bible-detail">
      <header className="sheet-header">
        <div className="sheet-title-group">
          {row.firstElementId ? (
            <button
              type="button"
              className="sheet-title bible-item-link"
              onClick={() => onJump(row.firstElementId!)}
            >
              {row.name}
            </button>
          ) : (
            <span className="sheet-title">{row.name}</span>
          )}
          <span className="char-meta">{row.meta}</span>
        </div>
        <button
          type="button"
          className="btn btn-small btn-danger"
          onClick={() => onRemove(row.name, row.kind)}
        >
          {t.removeEntry}
        </button>
      </header>

      <div className="sheet-body">
        {sections.map((section, sectionIndex) => (
          <fieldset key={section.id} className="sheet-section">
            <div className="sheet-section-head">
              {/* Editing a built-in heading makes it the writer's own, so
                  the translation key is dropped along with it. */}
              <input
                className="sheet-section-title"
                value={sectionTitle(section, t)}
                placeholder={t.sheetNewSection}
                onChange={(e) =>
                  updateSection(sectionIndex, (s) => ({
                    ...s,
                    titleKey: undefined,
                    title: e.target.value,
                  }))
                }
              />
              <div className="sheet-row-actions">
                <button
                  type="button"
                  className="icon-btn"
                  title={t.sheetMoveUp}
                  disabled={sectionIndex === 0}
                  onClick={() => update(move(sections, sectionIndex, sectionIndex - 1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title={t.sheetMoveDown}
                  disabled={sectionIndex === sections.length - 1}
                  onClick={() => update(move(sections, sectionIndex, sectionIndex + 1))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="icon-btn icon-btn-danger"
                  title={t.sheetRemoveSection}
                  onClick={() => update(sections.filter((_, i) => i !== sectionIndex))}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="sheet-fields">
              {section.fields.map((field, fieldIndex) => {
                const setFields = (fields: typeof section.fields) =>
                  updateSection(sectionIndex, (s) => ({ ...s, fields }));

                return (
                  <div key={field.id} className="sheet-field">
                    <input
                      className="sheet-field-label"
                      value={fieldLabel(field, t)}
                      placeholder={t.sheetNewField}
                      onChange={(e) =>
                        setFields(
                          section.fields.map((f, i) =>
                            i === fieldIndex
                              ? { ...f, labelKey: undefined, label: e.target.value }
                              : f
                          )
                        )
                      }
                    />
                    {field.multiline ? (
                      <textarea
                        className="sheet-field-value"
                        rows={3}
                        value={field.value}
                        placeholder={t.sheetFieldValuePlaceholder}
                        onChange={(e) =>
                          setFields(
                            section.fields.map((f, i) =>
                              i === fieldIndex ? { ...f, value: e.target.value } : f
                            )
                          )
                        }
                      />
                    ) : (
                      <input
                        className="sheet-field-value"
                        value={field.value}
                        placeholder={t.sheetFieldValuePlaceholder}
                        onChange={(e) =>
                          setFields(
                            section.fields.map((f, i) =>
                              i === fieldIndex ? { ...f, value: e.target.value } : f
                            )
                          )
                        }
                      />
                    )}
                    <div className="sheet-row-actions">
                      <button
                        type="button"
                        className={`icon-btn ${field.multiline ? 'is-active' : ''}`}
                        title={t.sheetMultiline}
                        onClick={() =>
                          setFields(
                            section.fields.map((f, i) =>
                              i === fieldIndex ? { ...f, multiline: !f.multiline } : f
                            )
                          )
                        }
                      >
                        ¶
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title={t.sheetMoveUp}
                        disabled={fieldIndex === 0}
                        onClick={() =>
                          setFields(move(section.fields, fieldIndex, fieldIndex - 1))
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        title={t.sheetMoveDown}
                        disabled={fieldIndex === section.fields.length - 1}
                        onClick={() =>
                          setFields(move(section.fields, fieldIndex, fieldIndex + 1))
                        }
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="icon-btn icon-btn-danger"
                        title={t.sheetRemoveField}
                        onClick={() =>
                          setFields(section.fields.filter((_, i) => i !== fieldIndex))
                        }
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="btn btn-small btn-ghost"
              onClick={() =>
                updateSection(sectionIndex, (s) => ({
                  ...s,
                  fields: [...s.fields, newField('')],
                }))
              }
            >
              + {t.sheetAddField}
            </button>
          </fieldset>
        ))}

        <section className="sheet-section">
          <h3 className="sheet-section-heading">{t.sheetNotes}</h3>
          <textarea
            className="char-bible"
            rows={4}
            placeholder={t.biblePlaceholder}
            value={entry?.note ?? ''}
            onChange={(e) => onNoteChange(row.name, row.kind, e.target.value)}
          />
        </section>
      </div>

      <footer className="sheet-footer">
        <button
          type="button"
          className="btn btn-small btn-ghost"
          onClick={() => update([...sections, newSection(t.sheetNewSection)])}
        >
          + {t.sheetAddSection}
        </button>
        <button
          type="button"
          className="btn btn-small btn-ghost"
          title={t.sheetSaveTemplate}
          onClick={() => {
            onSaveTemplate(row.kind, sections);
            setTemplateSaved(true);
          }}
        >
          {t.sheetSaveTemplate}
        </button>
        {templateSaved && <span className="char-meta">{t.sheetTemplateSaved}</span>}
      </footer>
    </section>
  );
}
