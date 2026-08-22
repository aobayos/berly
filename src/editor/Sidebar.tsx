import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ScriptElement } from '../model/types';
import { pageInfo } from '../model/pagination';
import { useI18n } from '../i18n';

interface Props {
  elements: ScriptElement[];
  /** Index of the first element on each page, measured from the rendered
   * pages (see ScriptPages) rather than estimated here. */
  pageStarts: number[];
  onJump: (elementId: string) => void;
  onReorderScenes: (fromIndex: number, toIndex: number) => void;
}

function SortableSceneItem({
  scene,
  index,
  onJump,
}: {
  scene: ScriptElement;
  index: number;
  onJump: (id: string) => void;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: scene.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        cursor: 'grab',
      }}
      {...attributes}
      {...listeners}
    >
      <button type="button" className="side-item" onClick={() => onJump(scene.id)}>
        <span className="side-num">{index + 1}</span>
        <span className="side-text">
          {scene.text.trim() ? scene.text.toUpperCase() : t.emptyScenePlaceholder}
        </span>
      </button>
    </li>
  );
}

export default function Sidebar({
  elements,
  pageStarts,
  onJump,
  onReorderScenes,
}: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'scenes' | 'pages'>('scenes');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const scenes = elements.filter((el) => el.type === 'scene');
  const pages = useMemo(() => pageInfo(elements, pageStarts), [elements, pageStarts]);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const fromIndex = scenes.findIndex((s) => s.id === active.id);
    const toIndex = scenes.findIndex((s) => s.id === over.id);
    if (fromIndex === -1 || toIndex === -1) return;
    onReorderScenes(fromIndex, toIndex);
  }

  return (
    <nav className="sidebar">
      <div className="side-tabs">
        <button
          type="button"
          className={`side-tab ${tab === 'scenes' ? 'is-active' : ''}`}
          onClick={() => setTab('scenes')}
        >
          {t.sceneNavigator}
        </button>
        <button
          type="button"
          className={`side-tab ${tab === 'pages' ? 'is-active' : ''}`}
          onClick={() => setTab('pages')}
        >
          {t.pagesTab} ({pages.length})
        </button>
      </div>

      {tab === 'scenes' &&
        (scenes.length === 0 ? (
          <p className="side-empty">{t.noScenes}</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={scenes.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <ol className="side-list">
                {scenes.map((scene, i) => (
                  <SortableSceneItem
                    key={scene.id}
                    scene={scene}
                    index={i}
                    onJump={onJump}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        ))}

      {tab === 'pages' && (
        <ol className="side-list">
          {pages.map((page) => (
            <li key={page.number}>
              <button
                type="button"
                className="side-item"
                onClick={() => onJump(page.elementId)}
              >
                <span className="side-num">{page.number}</span>
                <span className="side-text side-page">
                  <strong>
                    {t.page} {page.number}
                  </strong>
                  {page.snippet && (
                    <span className="side-snippet">{page.snippet}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </nav>
  );
}
