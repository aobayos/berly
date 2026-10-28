// The outline: one index card per scene, as on a corkboard. A card carries
// the heading, the scene's length in eighths of a page, who speaks in it and
// a synopsis the writer types on the card; dragging a card moves the whole
// scene in the script, the same reorderScenes() the sidebar uses.
import { useMemo } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DotsSixVertical } from '@phosphor-icons/react';
import type { BibleEntry, ScriptElement } from '@/model/types';
import { splitIntoSceneBlocks } from '@/services/sceneBlocks';
import { eighths, formatEighths } from '@/services/pagination';
import { characterResolver } from '@/services/characterAliases';
import { useI18n } from '@/i18n';

interface Props {
	elements: ScriptElement[];
	/** Measured by ScriptPages while the script was on screen, by element id. */
	heights: Map<string, number>;
	bible: BibleEntry[];
	onJump: (elementId: string) => void;
	onSynopsis: (sceneId: string, synopsis: string) => void;
	onReorderScenes: (fromIndex: number, toIndex: number) => void;
}

interface Card {
	scene: ScriptElement;
	number: number;
	/** Eighths of a page; null while the scene has never been measured. */
	length: number | null;
	speakers: string[];
}

export default function OutlineView({ elements, heights, bible, onJump, onSynopsis, onReorderScenes }: Props) {
	const { t } = useI18n();
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

	const cards = useMemo<Card[]>(() => {
		const resolve = characterResolver(bible);
		return splitIntoSceneBlocks(elements).blocks.map((block, i) => {
			let height = 0;
			let measured = true;
			for (const el of block) {
				const h = heights.get(el.id);
				if (h === undefined) measured = false;
				else height += h;
			}
			const speakers = [
				...new Set(
					block.filter((el) => el.type === 'character' && el.text.trim()).map((el) => resolve(el.text)),
				),
			];
			return {
				scene: block[0],
				number: i + 1,
				length: measured ? eighths(height) : null,
				speakers,
			};
		});
	}, [elements, heights, bible]);

	const total = cards.reduce((sum, card) => sum + (card.length ?? 0), 0);

	function handleDragEnd(e: DragEndEvent) {
		const { active, over } = e;
		if (!over || active.id === over.id) return;
		const from = cards.findIndex((c) => c.scene.id === active.id);
		const to = cards.findIndex((c) => c.scene.id === over.id);
		if (from !== -1 && to !== -1) onReorderScenes(from, to);
	}

	if (cards.length === 0) {
		return <p className="home-empty outline-empty">{t.noScenes}</p>;
	}

	return (
		<div className="outline">
			<p className="outline-summary">
				{cards.length} {cards.length === 1 ? t.scene : t.scenes}
				{total > 0 && ` · ${formatEighths(total)} ${t.pageShort}`}
			</p>
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragEnd={handleDragEnd}>
				<SortableContext
					items={cards.map((c) => c.scene.id)}
					strategy={rectSortingStrategy}>
					<ol className="outline-grid">
						{cards.map((card) => (
							<OutlineCard
								key={card.scene.id}
								card={card}
								onJump={onJump}
								onSynopsis={onSynopsis}
							/>
						))}
					</ol>
				</SortableContext>
			</DndContext>
		</div>
	);
}

function OutlineCard({
	card,
	onJump,
	onSynopsis,
}: {
	card: Card;
	onJump: (elementId: string) => void;
	onSynopsis: (sceneId: string, synopsis: string) => void;
}) {
	const { t } = useI18n();
	const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
		id: card.scene.id,
	});
	const { scene } = card;

	return (
		<li
			ref={setNodeRef}
			className={`outline-card ${isDragging ? 'is-dragging' : ''}`}
			style={{ transform: CSS.Transform.toString(transform), transition }}>
			<div className="outline-card-head">
				{/* Only the handle drags: the rest of the card is for reading and
            for typing, where a drag would fight text selection. */}
				<button
					type="button"
					ref={setActivatorNodeRef}
					className="outline-handle"
					aria-label={t.outlineMove}
					title={t.outlineMove}
					{...attributes}
					{...listeners}>
					<DotsSixVertical
						size={16}
						weight="bold"
					/>
				</button>
				<span className="outline-number">{card.number}</span>
				{card.length !== null && (
					<span className="outline-length">
						{formatEighths(card.length)} {t.pageShort}
					</span>
				)}
			</div>
			<button
				type="button"
				className="outline-heading"
				onClick={() => onJump(scene.id)}>
				{scene.text.trim() ? scene.text.toUpperCase() : t.emptyScenePlaceholder}
			</button>
			{card.speakers.length > 0 && <p className="outline-speakers">{card.speakers.join(', ')}</p>}
			<textarea
				className="outline-synopsis"
				rows={4}
				value={scene.synopsis ?? ''}
				placeholder={t.synopsisPlaceholder}
				onChange={(e) => onSynopsis(scene.id, e.target.value)}
			/>
		</li>
	);
}
