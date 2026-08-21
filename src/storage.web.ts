// localStorage-backed storage. Used directly in the browser build, and as
// the fallback in storage.ts when no Electron backend (window.berlyAPI) is
// present.
import type { Project, ProjectMeta } from './types';
import { newId } from './types';
import { migrate } from './projectMigrate';

const PREFIX = 'berly.project.';

export async function listProjects(): Promise<ProjectMeta[]> {
  const metas: ProjectMeta[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(PREFIX)) continue;
    const project = readKey(key);
    if (!project) continue;
    metas.push({
      id: project.id,
      kind: project.kind,
      name: project.name,
      scriptCount: project.scripts.length,
      sceneCount: project.scripts.reduce(
        (n, s) => n + s.elements.filter((el) => el.type === 'scene').length,
        0
      ),
      updatedAt: project.updatedAt,
    });
  }
  metas.sort((a, b) => b.updatedAt - a.updatedAt);
  return metas;
}

export async function loadProject(id: string): Promise<Project | null> {
  return readKey(PREFIX + id);
}

export async function saveProject(project: Project): Promise<void> {
  localStorage.setItem(PREFIX + project.id, JSON.stringify(project));
}

export async function deleteProject(id: string): Promise<void> {
  localStorage.removeItem(PREFIX + id);
}

/** Validates imported JSON and registers it under a fresh id. */
export async function importProject(json: string): Promise<Project> {
  const data = migrate(JSON.parse(json));
  if (!data) throw new Error('Invalid BERLY project file');
  const project: Project = {
    ...data,
    id: newId(),
    scripts: data.scripts.map((s) => ({
      ...s,
      id: newId(),
      elements: s.elements.map((el) => ({ ...el, id: newId() })),
    })),
    updatedAt: Date.now(),
  };
  await saveProject(project);
  return project;
}

function readKey(key: string): Project | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}
