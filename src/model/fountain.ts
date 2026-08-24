// Export to Fountain (https://fountain.io) — the open plain-text screenplay
// format understood by WriterDuet, Highland, Fade In and most other tools.
import type { Project, Script, ScriptElement } from './types';

const SCENE_PREFIX = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[. ]/i;

export function toFountain(project: Project, script: Script): string {
  const lines: string[] = [];
  const tp = project.titlePage;

  const title =
    project.kind === 'show' && script.name
      ? `${tp.title || project.name} — ${script.name}`
      : tp.title;
  if (title) lines.push(`Title: ${title}`);
  if (tp.credit) lines.push(`Credit: ${tp.credit}`);
  if (tp.author) lines.push(`Author: ${tp.author}`);
  if (tp.draftDate) lines.push(`Draft date: ${tp.draftDate}`);
  if (tp.contact) lines.push(`Contact: ${tp.contact}`);
  if (lines.length > 0) lines.push('');

  script.elements.forEach((el, i) => {
    const text = el.text.trim();
    if (!text) return;

    switch (el.type) {
      case 'scene': {
        // Headings without a recognized prefix need a leading "." in Fountain.
        const heading = text.toUpperCase();
        lines.push(SCENE_PREFIX.test(heading) ? heading : `.${heading}`);
        lines.push('');
        break;
      }
      case 'action':
        lines.push(text);
        lines.push('');
        break;
      case 'character': {
        const name = text.toUpperCase();
        // Fountain requires an "@" for names that aren't plain uppercase ASCII
        // (e.g. accented French names).
        lines.push(/^[A-Z0-9 .'\-()]+$/.test(name) ? name : `@${name}`);
        break;
      }
      case 'parenthetical': {
        const wrapped = text.startsWith('(') ? text : `(${text})`;
        lines.push(wrapped);
        break;
      }
      case 'dialogue': {
        lines.push(text);
        lines.push('');
        break;
      }
      case 'transition': {
        const t = text.toUpperCase();
        // Transitions must end in "TO:" — otherwise force with "> ".
        lines.push(t.endsWith('TO:') ? t : `> ${t}`);
        lines.push('');
        break;
      }
      case 'shot': {
        // Fountain has no shot element, so a shot leaves as an uppercase
        // action line and comes back as action. Deliberately not guessed at on
        // import: plenty of ordinary action is written in caps for emphasis,
        // and mislabelling those is worse than losing the shot type. FDX names
        // the type outright, so shots survive that round trip.
        lines.push(text.toUpperCase());
        lines.push('');
        break;
      }
      case 'lyrics': {
        lines.push(text.startsWith('~') ? text : `~${text}`);
        break;
      }
      case 'centered': {
        // "> text <" is Fountain's centered form; it must be on its own line.
        lines.push(`> ${text.replace(/^>\s*|\s*<$/g, '')} <`);
        lines.push('');
        break;
      }
    }

    // Guard: a character cue must be followed by dialogue/parenthetical in
    // Fountain; if the writer left it dangling, close the block.
    if (el.type === 'character') {
      const next = nextNonEmptyType(script.elements, i);
      if (next !== 'dialogue' && next !== 'parenthetical' && next !== 'lyrics') {
        lines.push('');
      }
    }
  });

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function nextNonEmptyType(
  elements: ScriptElement[],
  from: number
): string | null {
  for (let i = from + 1; i < elements.length; i++) {
    if (elements[i].text.trim()) return elements[i].type;
  }
  return null;
}
