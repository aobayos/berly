// Turning a parsed screenplay into a Project, or folding it into one that
// already exists. Kept apart from the parsers so the merge rules are in one
// readable place rather than spread across two format-specific files.
import type { ImportedScreenplay } from './screenplayImport';
import type { Project, Script, TitlePage } from './types';
import { newElement, newId, newProject, newScript } from './types';

/** Imported metadata fills fields the writer left empty and never overwrites
 * anything they typed — chosen so importing episodes into a series that is
 * already set up cannot quietly rewrite its title page. */
function mergeTitlePage(existing: TitlePage, incoming: Partial<TitlePage>): TitlePage {
  const merged = { ...existing };
  for (const key of Object.keys(incoming) as (keyof TitlePage)[]) {
    const value = incoming[key];
    if (value && !existing[key].trim()) merged[key] = value;
  }
  return merged;
}

/** An empty import would otherwise produce a script with no elements at all,
 * which the editor has no caret to put anywhere. */
function bodyOrBlank(imported: ImportedScreenplay): Script['elements'] {
  return imported.elements.length > 0 ? imported.elements : [newElement('scene')];
}

export function projectFromImport(
  imported: ImportedScreenplay,
  name: string
): Project {
  const project = newProject(name, 'movie', name);
  const script = project.scripts[0];
  return {
    ...project,
    titlePage: mergeTitlePage(
      { ...project.titlePage, title: imported.titlePage.title ?? name },
      imported.titlePage
    ),
    scripts: [{ ...script, elements: bodyOrBlank(imported) }],
  };
}

export function appendEpisode(
  project: Project,
  imported: ImportedScreenplay,
  episodeName: string
): Project {
  const script = { ...newScript(episodeName), elements: bodyOrBlank(imported) };
  return {
    ...project,
    titlePage: mergeTitlePage(project.titlePage, imported.titlePage),
    scripts: [...project.scripts, script],
    updatedAt: Date.now(),
  };
}

/** Replaces one episode's body. The script keeps its id so open tabs, routes
 * and recents still point at something that exists; only the content and the
 * element ids change. */
export function replaceEpisode(
  project: Project,
  imported: ImportedScreenplay,
  scriptId: string
): Project {
  const now = Date.now();
  return {
    ...project,
    titlePage: mergeTitlePage(project.titlePage, imported.titlePage),
    scripts: project.scripts.map((s) =>
      s.id === scriptId
        ? { ...s, elements: bodyOrBlank(imported).map((el) => ({ ...el, id: newId() })), updatedAt: now }
        : s
    ),
    updatedAt: now,
  };
}
