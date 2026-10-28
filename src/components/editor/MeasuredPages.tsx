// Page breaks for scripts that aren't open in an editor — the project page's
// reports cover every episode. Each script is laid out off-screen by the
// editor's own ScriptPages, with the same stylesheet, so the numbers are the
// ones the writer will see on opening it, not an estimate that disagrees.
import { memo } from 'react';
import type { Script, ScriptElement } from '@/model/types';
import ScriptPages from '@/components/editor/ScriptPages';
import { useI18n } from '@/i18n';

interface Props {
  scripts: Script[];
  onMeasured(scriptId: string, pageStarts: number[]): void;
}

export default function MeasuredPages({ scripts, onMeasured }: Props) {
  return (
    <div className="measure-offscreen" aria-hidden="true">
      {scripts.map((script) => (
        <MeasuredScript
          key={script.id}
          scriptId={script.id}
          elements={script.elements}
          onMeasured={onMeasured}
        />
      ))}
    </div>
  );
}

const noop = () => {};

/** Memoised on the element list, so typing elsewhere on the project page
 * (the Bible, the title page) doesn't lay every episode out again. */
const MeasuredScript = memo(function MeasuredScript({
  scriptId,
  elements,
  onMeasured,
}: {
  scriptId: string;
  elements: ScriptElement[];
  onMeasured(scriptId: string, pageStarts: number[]): void;
}) {
  const { t } = useI18n();
  return (
    <ScriptPages
      elements={elements}
      hidden={false}
      onPageMouseDown={noop}
      onPageStartsChange={(starts) => onMeasured(scriptId, starts)}
      // The editor's ElementBlock without the editing: the same classes and
      // placeholder, which is all that decides an element's height.
      renderElement={(el) => (
        <div key={el.id} className="el-wrap" data-el-id={el.id}>
          <div className={`el el-${el.type}`} data-placeholder={t.placeholders[el.type]}>
            {el.text}
          </div>
        </div>
      )}
    />
  );
});
