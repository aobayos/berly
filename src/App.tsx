import { useEffect, useMemo, useState } from 'react';
import Shell from '@/Shell';
import { DICTS, I18nContext, loadLang, saveLang, type Lang } from '@/i18n';
import { TabsProvider } from '@/contexts/tabs';
import { ContextMenuProvider } from '@/contexts/contextMenu';
import { EditorCommandsProvider } from '@/contexts/commands';
import { UnsavedGuardProvider } from '@/contexts/UnsavedGuard';
import { setSpellCheckerLanguage } from '@/desktop/bridge';

export default function App() {
	const [lang, setLangState] = useState<Lang>(loadLang);

	// The spellchecker follows the UI language: a French screenplay checked
	// against an English dictionary comes back with every word underlined.
	// The lang attribute is what the browser build keys off; the desktop build
	// is told directly, since Electron's session owns its own dictionaries.
	useEffect(() => {
		document.documentElement.lang = lang;
		setSpellCheckerLanguage(lang);
	}, [lang]);

	const i18n = useMemo(
		() => ({
			lang,
			t: DICTS[lang],
			setLang: (next: Lang) => {
				saveLang(next);
				setLangState(next);
			},
		}),
		[lang],
	);

	return (
		<I18nContext.Provider value={i18n}>
			{/* Above the tabs: closing one has to be able to await the answer. */}
			<UnsavedGuardProvider>
				<TabsProvider>
					<EditorCommandsProvider>
						<ContextMenuProvider>
							<Shell />
						</ContextMenuProvider>
					</EditorCommandsProvider>
				</TabsProvider>
			</UnsavedGuardProvider>
		</I18nContext.Provider>
	);
}
