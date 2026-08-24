// One registry behind every way of triggering an action: the title-bar
// menus, the keyboard, the macOS native menu and the shortcuts cheat-sheet
// all read from here, so a command can never have two different labels or a
// shortcut that the menu advertises but nothing listens for.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { MenuEntry } from '../ui/PopupMenu';
import { clipboardEntries } from './contextMenu';
import { useI18n, type Dict } from '../i18n';
import { useIsActiveTab, useTabs } from './tabs';
import type { RecentProject } from '../desktop/types';
import { closeWindow, isDesktop } from '../desktop/bridge';
import { isFileBased } from '../storage/documents';

export type EditorView = 'script' | 'title' | 'bible';

/** What the editor of the *active* tab can currently do. Published by
 * Editor.tsx; empty when no script is open. */
export interface EditorCommands {
  save(): void;
  /** Desktop only — the web build has no file to point somewhere else. */
  saveAs(): void;
  undo(): void;
  redo(): void;
  find(): void;
  exportFountain(): void;
  exportPdf(): void;
  setView(view: EditorView): void;
  view: EditorView;
  canUndo: boolean;
  canRedo: boolean;
}

interface EditorCommandsStore {
  commands: EditorCommands | null;
  publish(commands: EditorCommands | null): void;
}

const EditorCommandsContext = createContext<EditorCommandsStore>({
  commands: null,
  publish: () => {},
});

export function EditorCommandsProvider({ children }: { children: ReactNode }) {
  const [commands, setCommands] = useState<EditorCommands | null>(null);
  const value = useMemo<EditorCommandsStore>(
    () => ({ commands, publish: setCommands }),
    [commands]
  );
  return (
    <EditorCommandsContext.Provider value={value}>
      {children}
    </EditorCommandsContext.Provider>
  );
}

/** Called by the editor. Only the visible tab's editor publishes — hidden
 * tabs stay mounted, and menus must describe what's on screen. */
export function useRegisterEditorCommands(commands: EditorCommands): void {
  const { publish } = useContext(EditorCommandsContext);
  const active = useIsActiveTab();

  useEffect(() => {
    if (!active) return;
    publish(commands);
    return () => publish(null);
  }, [active, commands, publish]);
}

export function useEditorCommands(): EditorCommands | null {
  return useContext(EditorCommandsContext).commands;
}

export interface Command {
  id: string;
  label: string;
  accelerator?: string;
  /** Which block of the shortcuts cheat-sheet this belongs to. */
  group: 'project' | 'edit' | 'view' | 'tabs';
  enabled: boolean;
  run(): void;
}

export interface MenuSpec {
  label: string;
  /** Alt+<letter> opens this menu. */
  mnemonic: string;
  /** Evaluated when the menu opens, so entries reflect the current
   * selection, recents list and undo depth rather than the last render. */
  entries(): MenuEntry[];
}

/** Shell-level actions that live above the tabs and so can't be reached by
 * routing — the project switcher, the file picker, the shortcuts sheet. */
export interface ShellActions {
  openProjectDialog(mode: 'open' | 'create'): void;
  openFromFile(): void;
  /** Picks a .fountain/.fdx file and opens the import target dialog. */
  importScreenplay(): void;
  showShortcuts(): void;
}

const ShellActionsContext = createContext<ShellActions>({
  openProjectDialog: () => {},
  openFromFile: () => {},
  importScreenplay: () => {},
  showShortcuts: () => {},
});

export const ShellActionsProvider = ShellActionsContext.Provider;

export function useShellActions(): ShellActions {
  return useContext(ShellActionsContext);
}

export interface CommandContext extends ShellActions {
  recents: RecentProject[];
  /** Goes through the file path rather than the id, so a recent still opens
   * after the app has forgotten where that project lived. */
  openRecent(recent: RecentProject): void;
  clearRecents(): void;
}

export function useCommands(ctx: CommandContext): Command[] {
  const { t } = useI18n();
  const tabs = useTabs();
  const editor = useEditorCommands();

  return useMemo(() => {
    const list: Command[] = [
      {
        id: 'project.new',
        label: t.newProject,
        accelerator: 'Mod+N',
        group: 'project',
        enabled: true,
        run: () => ctx.openProjectDialog('create'),
      },
      {
        id: 'project.open',
        label: t.menuOpenProject,
        accelerator: 'Mod+O',
        group: 'project',
        enabled: true,
        run: () => ctx.openProjectDialog('open'),
      },
      {
        id: 'project.openFile',
        label: t.menuOpenFile,
        accelerator: 'Mod+Shift+O',
        group: 'project',
        enabled: true,
        run: ctx.openFromFile,
      },
      {
        id: 'project.importScreenplay',
        label: t.menuImportScreenplay,
        group: 'project',
        enabled: true,
        run: ctx.importScreenplay,
      },
      {
        id: 'file.save',
        label: t.menuSave,
        accelerator: 'Mod+S',
        group: 'project',
        enabled: Boolean(editor),
        run: () => editor?.save(),
      },
      {
        id: 'file.saveAs',
        label: t.menuSaveAs,
        accelerator: 'Mod+Shift+S',
        group: 'project',
        enabled: Boolean(editor) && isFileBased,
        run: () => editor?.saveAs(),
      },
      {
        id: 'file.exportFountain',
        label: t.exportFountain,
        group: 'project',
        enabled: Boolean(editor),
        run: () => editor?.exportFountain(),
      },
      {
        id: 'file.exportPdf',
        label: t.exportPdf,
        accelerator: 'Mod+P',
        group: 'project',
        enabled: Boolean(editor),
        run: () => editor?.exportPdf(),
      },
      {
        id: 'edit.undo',
        label: t.menuUndo,
        accelerator: 'Mod+Z',
        group: 'edit',
        enabled: Boolean(editor?.canUndo),
        run: () => editor?.undo(),
      },
      {
        id: 'edit.redo',
        label: t.menuRedo,
        accelerator: 'Mod+Shift+Z',
        group: 'edit',
        enabled: Boolean(editor?.canRedo),
        run: () => editor?.redo(),
      },
      {
        id: 'edit.find',
        label: t.find,
        accelerator: 'Mod+F',
        group: 'edit',
        enabled: Boolean(editor),
        run: () => editor?.find(),
      },
      {
        id: 'view.script',
        label: t.script,
        // Letters, not digits: on AZERTY the number row needs Shift, so
        // Mod+Shift+<digit> is how a French keyboard types Mod+<digit> —
        // which the editor already uses for element types.
        accelerator: 'Mod+Alt+S',
        group: 'view',
        enabled: Boolean(editor),
        run: () => editor?.setView('script'),
      },
      {
        id: 'view.title',
        label: t.titlePage,
        accelerator: 'Mod+Alt+T',
        group: 'view',
        enabled: Boolean(editor),
        run: () => editor?.setView('title'),
      },
      {
        id: 'view.bible',
        label: t.bibleTab,
        accelerator: 'Mod+Alt+B',
        group: 'view',
        enabled: Boolean(editor),
        run: () => editor?.setView('bible'),
      },
      {
        id: 'tab.close',
        label: t.menuCloseTab,
        accelerator: 'Mod+W',
        group: 'tabs',
        enabled: tabs.activeId !== null,
        run: () => tabs.activeId && tabs.closeTab(tabs.activeId),
      },
      {
        id: 'tab.next',
        label: t.menuNextTab,
        accelerator: 'Ctrl+Tab',
        group: 'tabs',
        enabled: tabs.tabs.length > 1,
        run: () => tabs.cycle(1),
      },
      {
        id: 'tab.prev',
        label: t.menuPrevTab,
        accelerator: 'Ctrl+Shift+Tab',
        group: 'tabs',
        enabled: tabs.tabs.length > 1,
        run: () => tabs.cycle(-1),
      },
      {
        id: 'help.shortcuts',
        label: t.menuShortcuts,
        accelerator: 'F1',
        group: 'view',
        enabled: true,
        run: ctx.showShortcuts,
      },
    ];

    // Alt+1…8 select a tab by position, Alt+9 the last one.
    for (let i = 0; i < 9; i++) {
      list.push({
        id: `tab.select${i + 1}`,
        label: `${t.menuGoToTab} ${i + 1}`,
        accelerator: `Alt+${i + 1}`,
        group: 'tabs',
        enabled: true,
        run: () => tabs.activateIndex(i),
      });
    }

    return list;
  }, [t, tabs, editor, ctx]);
}

/** Menu bar layout. Entries are thunks — see MenuSpec.entries. */
export function useMenus(commands: Command[], ctx: CommandContext): MenuSpec[] {
  const { t, lang, setLang } = useI18n();
  const editor = useEditorCommands();

  return useMemo(() => {
    const byId = new Map(commands.map((c) => [c.id, c]));
    const item = (id: string, overrides: Partial<MenuEntry> = {}): MenuEntry => {
      const c = byId.get(id);
      if (!c) return { label: id, disabled: true };
      return {
        label: c.label,
        accelerator: c.accelerator,
        disabled: !c.enabled,
        onSelect: c.run,
        ...overrides,
      };
    };

    const recentEntries = (): MenuEntry[] => {
      if (ctx.recents.length === 0) {
        return [{ label: t.menuNoRecents, disabled: true }];
      }
      return [
        ...ctx.recents.slice(0, 10).map((r) => ({
          label: r.name || t.untitled,
          onSelect: () => ctx.openRecent(r),
        })),
        { separator: true },
        { label: t.menuClearRecents, onSelect: ctx.clearRecents },
      ];
    };

    return [
      {
        label: t.menuFile,
        mnemonic: 'f',
        entries: () => [
          item('project.new'),
          item('project.open'),
          item('project.openFile'),
          item('project.importScreenplay'),
          item('project.importScreenplay'),
          { label: t.menuOpenRecent, submenu: recentEntries() },
          { separator: true },
          item('file.save'),
          ...(isFileBased ? [item('file.saveAs')] : []),
          item('file.exportFountain'),
          item('file.exportPdf'),
          { separator: true },
          item('tab.close'),
          ...(isDesktop
            ? [{ label: t.menuExit, onSelect: closeWindow } as MenuEntry]
            : []),
        ],
      },
      {
        label: t.menuEdit,
        mnemonic: 'e',
        entries: () => [
          item('edit.undo'),
          item('edit.redo'),
          { separator: true },
          // Built fresh on open so they reflect the live selection.
          ...clipboardEntries(t, isEditableFocused()),
          { separator: true },
          item('edit.find'),
        ],
      },
      {
        label: t.menuView,
        mnemonic: 'v',
        entries: () => [
          item('view.script', { checked: editor?.view === 'script' }),
          item('view.title', { checked: editor?.view === 'title' }),
          item('view.bible', { checked: editor?.view === 'bible' }),
          { separator: true },
          item('tab.next'),
          item('tab.prev'),
          { separator: true },
          {
            label: 'English',
            checked: lang === 'en',
            onSelect: () => setLang('en'),
          },
          {
            label: 'Français',
            checked: lang === 'fr',
            onSelect: () => setLang('fr'),
          },
        ],
      },
      {
        label: t.menuHelp,
        mnemonic: 'h',
        entries: () => [item('help.shortcuts')],
      },
    ];
  }, [commands, ctx, t, lang, setLang, editor]);
}

function isEditableFocused(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return Boolean(
    el &&
      (el.isContentEditable ||
        el.matches('input:not([type=file]), textarea'))
  );
}

/** Shortcut labels for the cheat-sheet, grouped the way the modal shows
 * them. Derived from the registry so it can't go stale. */
export function groupCommands(
  commands: Command[],
  t: Dict
): { title: string; items: Command[] }[] {
  const titles: Record<Command['group'], string> = {
    project: t.menuFile,
    edit: t.menuEdit,
    view: t.menuView,
    tabs: t.menuTabs,
  };
  return (['project', 'edit', 'view', 'tabs'] as const)
    .map((group) => ({
      title: titles[group],
      // The nine Alt+n tab shortcuts collapse to a single line in the sheet.
      items: commands.filter(
        (c) => c.group === group && c.accelerator && !/^tab\.select[2-9]$/.test(c.id)
      ),
    }))
    .filter((g) => g.items.length > 0);
}
