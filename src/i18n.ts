import { createContext, useContext } from 'react';
import type { ElementType } from './types';

export type Lang = 'en' | 'fr';

const LANG_KEY = 'berly.lang';

export function loadLang(): Lang {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === 'en' || saved === 'fr') return saved;
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function saveLang(lang: Lang): void {
  localStorage.setItem(LANG_KEY, lang);
}

const en = {
  // Project list
  appTagline: 'Your scripts, your way.',
  projects: 'Projects',
  newProject: 'New Project',
  newProjectNamePlaceholder: 'Title…',
  create: 'Create',
  cancel: 'Cancel',
  open: 'Open',
  deleteProject: 'Delete',
  deleteConfirm: 'Delete this project? This cannot be undone.',
  importProject: 'Import',
  exportProject: 'Export',
  noProjects: 'No projects yet. Create your first script!',
  scenes: 'scenes',
  scene: 'scene',
  lastEdited: 'Last edited',
  untitled: 'Untitled',
  importError: 'This file is not a valid BERLY project.',
  movie: 'Movie',
  show: 'Series',
  episode: 'episode',
  episodes: 'episodes',

  // Episode list
  newEpisode: 'New Episode',
  defaultEpisodeName: 'Episode',
  deleteEpisodeConfirm: 'Delete this episode? This cannot be undone.',
  backToProjects: 'Projects',
  renameEpisode: 'Rename',
  renamePrompt: 'New name:',

  // Editor
  backToEpisodes: 'Episodes',
  titlePage: 'Title Page',
  script: 'Script',
  saved: 'Saved',
  saving: 'Saving…',
  exportFountain: 'Export .fountain',
  exportPdf: 'Export PDF',
  notFound: 'Not found.',

  // Sidebar
  sceneNavigator: 'Scenes',
  pagesTab: 'Pages',
  noScenes: 'No scenes yet',
  page: 'Page',
  emptyScenePlaceholder: '(empty scene heading)',
  find: 'Find',
  findPlaceholder: 'Find in script…',
  noMatches: 'No matches',

  // Bible
  bibleTab: 'Bible',
  bibleCharacters: 'Characters',
  bibleLocations: 'Locations',
  noCharacters: 'No characters yet',
  noLocations: 'No locations yet',
  addCharacter: 'Add character',
  addLocation: 'Add location',
  newCharacterPlaceholder: 'New character name…',
  newLocationPlaceholder: 'New location name…',
  notUsedYet: 'Not used in the script yet',
  removeEntry: 'Remove',
  line: 'line',
  lines: 'lines',
  biblePlaceholder: 'Notes about this character or location…',

  // Title page fields
  tpTitle: 'Title',
  tpCredit: 'Credit (e.g. Written by)',
  tpAuthor: 'Author',
  tpContact: 'Contact',
  tpDraftDate: 'Draft date',

  // Element types
  elements: {
    scene: 'Scene Heading',
    action: 'Action',
    character: 'Character',
    dialogue: 'Dialogue',
    parenthetical: 'Parenthetical',
    transition: 'Transition',
  } as Record<ElementType, string>,

  // Element placeholders
  placeholders: {
    scene: 'INT. LOCATION - DAY',
    action: 'Describe what happens…',
    character: 'CHARACTER NAME',
    dialogue: 'What do they say?',
    parenthetical: '(how they say it)',
    transition: 'CUT TO:',
  } as Record<ElementType, string>,

  shortcutsHint:
    'Enter: new element · Tab: change type · Ctrl+1–6: set type · Ctrl+Space: suggestions · Ctrl+S: save · Ctrl+Z: undo · Ctrl+Shift+Z: redo · Ctrl+F: find · F1: all shortcuts',

  // Menu bar
  menuFile: 'File',
  menuEdit: 'Edit',
  menuView: 'View',
  menuHelp: 'Help',
  menuTabs: 'Tabs',
  menuOpenProject: 'Open Project…',
  menuOpenFile: 'Open from File…',
  menuOpenRecent: 'Open Recent',
  menuNoRecents: 'No recent projects',
  menuClearRecents: 'Clear recent projects',
  menuSave: 'Save',
  menuUndo: 'Undo',
  menuRedo: 'Redo',
  menuCloseTab: 'Close Tab',
  menuNextTab: 'Next Tab',
  menuPrevTab: 'Previous Tab',
  menuGoToTab: 'Go to Tab',
  menuShortcuts: 'Keyboard Shortcuts',
  menuExit: 'Exit',

  // Window controls
  winMinimize: 'Minimize',
  winMaximize: 'Maximize',
  winRestore: 'Restore',
  winClose: 'Close',

  // Tabs
  tabCloseOthers: 'Close Other Tabs',
  tabCloseAll: 'Close All Tabs',

  // Open-project dialog
  openSearchPlaceholder: 'Search projects…',
  openRecentSection: 'Recent',
  openAllSection: 'All projects',
  openInBackground: 'Open in background tab',
  removeFromRecents: 'Remove from recent',
  close: 'Close',

  // Context menu
  ctxCut: 'Cut',
  ctxCopy: 'Copy',
  ctxPaste: 'Paste',
  ctxSelectAll: 'Select All',
  ctxElementType: 'Element type',
  ctxSuggestions: 'Suggestions',
  spellNoSuggestions: 'No spelling suggestions',
  spellAddToDictionary: 'Add to dictionary',

  // Shortcut sheet — the editor keys that aren't menu commands
  keyEditorSection: 'Editor',
  keyEnter: 'New element',
  keyTab: 'Cycle element type',
  keyElementType: 'Set element type',
  keySuggestions: 'Suggestions',
  keyMerge: 'Merge into previous element',

  // Document files
  menuSaveAs: 'Save As…',
  unsavedChanges: 'Unsaved changes',
  unsavedTitle: 'Save changes?',
  unsavedOne: 'This project has changes that are not in its file yet.',
  unsavedMany: 'These projects have changes that are not in their files yet:',
  saveAndClose: 'Save',
  discardChanges: "Don't save",
  neverSaved: 'Never saved',
  recoveryTitle: 'Unsaved work recovered',
  recoveryIntro:
    'BERLY closed before these changes were saved. Recovered work opens as unsaved, so you can look it over and save it yourself.',
  recoveryRecover: 'Recover',
  recoveryDiscard: 'Discard',
  recoveryFrom: 'From',
  removeFromList: 'Remove from list',
  removeFromListConfirm:
    'Remove this project from the list? Its file is moved to the recycle bin and can be restored from there.',

  // Character & location sheets
  sheetTab: 'Sheet',
  sheetNotes: 'Notes',
  sheetEmpty: 'Select a character or a location.',
  sheetAddSection: 'Add section',
  sheetAddField: 'Add field',
  sheetNewSection: 'New section',
  sheetNewField: 'New field',
  sheetRemoveSection: 'Remove section',
  sheetRemoveField: 'Remove field',
  sheetMoveUp: 'Move up',
  sheetMoveDown: 'Move down',
  sheetSaveTemplate: 'Use this layout for new sheets',
  sheetTemplateSaved: 'Layout saved as the default for new sheets.',
  sheetResetTemplate: 'Reset to the built-in layout',
  sheetFieldValuePlaceholder: '…',
  sheetMultiline: 'Long text',

  // Built-in character sheet
  sheetSecIdentity: 'Identity',
  sheetSecDrama: 'Dramaturgy',
  sheetSecVoice: 'Voice & appearance',
  sheetSecBackstory: 'Backstory & relationships',
  sheetFieldFullName: 'Full name',
  sheetFieldAge: 'Age',
  sheetFieldRole: 'Role in the story',
  sheetFieldOccupation: 'Occupation',
  sheetFieldWant: 'Wants',
  sheetFieldNeed: 'Needs',
  sheetFieldFlaw: 'Flaw',
  sheetFieldArc: 'Arc',
  sheetFieldObstacle: 'Obstacle',
  sheetFieldVoice: 'Way of speaking',
  sheetFieldAppearance: 'Appearance',
  sheetFieldBackstory: 'Backstory',
  sheetFieldRelationships: 'Relationships',

  // Built-in location sheet
  sheetSecPlace: 'The place',
  sheetSecAtmosphere: 'Atmosphere',
  sheetFieldKind: 'Interior / Exterior',
  sheetFieldWhere: 'Where it is',
  sheetFieldDescription: 'Description',
  sheetFieldMood: 'Mood',
  sheetFieldStory: 'What happens here',
};

export type Dict = typeof en;

const fr: Dict = {
  appTagline: 'Vos scénarios, à votre façon.',
  projects: 'Projets',
  newProject: 'Nouveau projet',
  newProjectNamePlaceholder: 'Titre…',
  create: 'Créer',
  cancel: 'Annuler',
  open: 'Ouvrir',
  deleteProject: 'Supprimer',
  deleteConfirm: 'Supprimer ce projet ? Cette action est irréversible.',
  importProject: 'Importer',
  exportProject: 'Exporter',
  noProjects: 'Aucun projet. Créez votre premier scénario !',
  scenes: 'scènes',
  scene: 'scène',
  lastEdited: 'Modifié',
  untitled: 'Sans titre',
  importError: "Ce fichier n'est pas un projet BERLY valide.",
  movie: 'Film',
  show: 'Série',
  episode: 'épisode',
  episodes: 'épisodes',

  newEpisode: 'Nouvel épisode',
  defaultEpisodeName: 'Épisode',
  deleteEpisodeConfirm: 'Supprimer cet épisode ? Cette action est irréversible.',
  backToProjects: 'Projets',
  renameEpisode: 'Renommer',
  renamePrompt: 'Nouveau nom :',

  backToEpisodes: 'Épisodes',
  titlePage: 'Page de titre',
  script: 'Scénario',
  saved: 'Enregistré',
  saving: 'Enregistrement…',
  exportFountain: 'Exporter .fountain',
  exportPdf: 'Exporter PDF',
  notFound: 'Introuvable.',

  sceneNavigator: 'Scènes',
  pagesTab: 'Pages',
  noScenes: 'Aucune scène',
  page: 'Page',
  emptyScenePlaceholder: '(intitulé de scène vide)',
  find: 'Rechercher',
  findPlaceholder: 'Rechercher dans le scénario…',
  noMatches: 'Aucun résultat',

  bibleTab: 'Bible',
  bibleCharacters: 'Personnages',
  bibleLocations: 'Lieux',
  noCharacters: 'Aucun personnage',
  noLocations: 'Aucun lieu',
  addCharacter: 'Ajouter un personnage',
  addLocation: 'Ajouter un lieu',
  newCharacterPlaceholder: 'Nom du nouveau personnage…',
  newLocationPlaceholder: 'Nom du nouveau lieu…',
  notUsedYet: "Pas encore utilisé dans le scénario",
  removeEntry: 'Supprimer',
  line: 'ligne',
  lines: 'lignes',
  biblePlaceholder: 'Notes sur ce personnage ou ce lieu…',

  tpTitle: 'Titre',
  tpCredit: 'Mention (ex. Écrit par)',
  tpAuthor: 'Auteur',
  tpContact: 'Contact',
  tpDraftDate: 'Date de la version',

  elements: {
    scene: 'Intitulé de scène',
    action: 'Action',
    character: 'Personnage',
    dialogue: 'Dialogue',
    parenthetical: 'Didascalie',
    transition: 'Transition',
  },

  placeholders: {
    scene: 'INT. LIEU - JOUR',
    action: 'Décrivez ce qui se passe…',
    character: 'NOM DU PERSONNAGE',
    dialogue: 'Que disent-ils ?',
    parenthetical: '(la manière de le dire)',
    transition: 'COUPE À :',
  },

  shortcutsHint:
    'Entrée : nouvel élément · Tab : changer le type · Ctrl+1–6 : type direct · Ctrl+Espace : suggestions · Ctrl+S : enregistrer · Ctrl+Z : annuler · Ctrl+Maj+Z : rétablir · Ctrl+F : rechercher · F1 : tous les raccourcis',

  menuFile: 'Fichier',
  menuEdit: 'Édition',
  menuView: 'Affichage',
  menuHelp: 'Aide',
  menuTabs: 'Onglets',
  menuOpenProject: 'Ouvrir un projet…',
  menuOpenFile: 'Ouvrir depuis un fichier…',
  menuOpenRecent: 'Projets récents',
  menuNoRecents: 'Aucun projet récent',
  menuClearRecents: 'Effacer les projets récents',
  menuSave: 'Enregistrer',
  menuUndo: 'Annuler',
  menuRedo: 'Rétablir',
  menuCloseTab: "Fermer l'onglet",
  menuNextTab: 'Onglet suivant',
  menuPrevTab: 'Onglet précédent',
  menuGoToTab: "Aller à l'onglet",
  menuShortcuts: 'Raccourcis clavier',
  menuExit: 'Quitter',

  winMinimize: 'Réduire',
  winMaximize: 'Agrandir',
  winRestore: 'Restaurer',
  winClose: 'Fermer',

  tabCloseOthers: 'Fermer les autres onglets',
  tabCloseAll: 'Fermer tous les onglets',

  openSearchPlaceholder: 'Rechercher un projet…',
  openRecentSection: 'Récents',
  openAllSection: 'Tous les projets',
  openInBackground: 'Ouvrir dans un onglet en arrière-plan',
  removeFromRecents: 'Retirer des récents',
  close: 'Fermer',

  ctxCut: 'Couper',
  ctxCopy: 'Copier',
  ctxPaste: 'Coller',
  ctxSelectAll: 'Tout sélectionner',
  ctxElementType: "Type d'élément",
  ctxSuggestions: 'Suggestions',
  spellNoSuggestions: 'Aucune suggestion orthographique',
  spellAddToDictionary: 'Ajouter au dictionnaire',

  keyEditorSection: 'Éditeur',
  keyEnter: 'Nouvel élément',
  keyTab: "Changer le type d'élément",
  keyElementType: "Définir le type d'élément",
  keySuggestions: 'Suggestions',
  keyMerge: "Fusionner avec l'élément précédent",

  menuSaveAs: 'Enregistrer sous…',
  unsavedChanges: 'Modifications non enregistrées',
  unsavedTitle: 'Enregistrer les modifications ?',
  unsavedOne:
    "Ce projet contient des modifications qui ne sont pas encore dans son fichier.",
  unsavedMany:
    'Ces projets contiennent des modifications qui ne sont pas encore dans leurs fichiers :',
  saveAndClose: 'Enregistrer',
  discardChanges: 'Ne pas enregistrer',
  neverSaved: 'Jamais enregistré',
  recoveryTitle: 'Travail non enregistré récupéré',
  recoveryIntro:
    "BERLY s'est fermé avant l'enregistrement de ces modifications. Le travail récupéré s'ouvre comme non enregistré : relisez-le, puis enregistrez-le vous-même.",
  recoveryRecover: 'Récupérer',
  recoveryDiscard: 'Abandonner',
  recoveryFrom: 'Depuis',
  removeFromList: 'Retirer de la liste',
  removeFromListConfirm:
    'Retirer ce projet de la liste ? Son fichier est déplacé vers la corbeille, d’où il peut être restauré.',

  sheetTab: 'Fiche',
  sheetNotes: 'Notes',
  sheetEmpty: 'Sélectionnez un personnage ou un lieu.',
  sheetAddSection: 'Ajouter une section',
  sheetAddField: 'Ajouter un champ',
  sheetNewSection: 'Nouvelle section',
  sheetNewField: 'Nouveau champ',
  sheetRemoveSection: 'Supprimer la section',
  sheetRemoveField: 'Supprimer le champ',
  sheetMoveUp: 'Monter',
  sheetMoveDown: 'Descendre',
  sheetSaveTemplate: 'Utiliser cette mise en page pour les nouvelles fiches',
  sheetTemplateSaved:
    'Mise en page enregistrée comme modèle des nouvelles fiches.',
  sheetResetTemplate: 'Revenir à la mise en page par défaut',
  sheetFieldValuePlaceholder: '…',
  sheetMultiline: 'Texte long',

  sheetSecIdentity: 'Identité',
  sheetSecDrama: 'Dramaturgie',
  sheetSecVoice: 'Voix et apparence',
  sheetSecBackstory: 'Passé et liens',
  sheetFieldFullName: 'Nom complet',
  sheetFieldAge: 'Âge',
  sheetFieldRole: "Rôle dans l'histoire",
  sheetFieldOccupation: 'Métier',
  sheetFieldWant: 'Veut',
  sheetFieldNeed: 'A besoin de',
  sheetFieldFlaw: 'Faille',
  sheetFieldArc: 'Arc',
  sheetFieldObstacle: 'Obstacle',
  sheetFieldVoice: 'Façon de parler',
  sheetFieldAppearance: 'Apparence',
  sheetFieldBackstory: 'Passé',
  sheetFieldRelationships: 'Liens',

  sheetSecPlace: 'Le lieu',
  sheetSecAtmosphere: 'Atmosphère',
  sheetFieldKind: 'Intérieur / Extérieur',
  sheetFieldWhere: 'Où il se trouve',
  sheetFieldDescription: 'Description',
  sheetFieldMood: 'Ambiance',
  sheetFieldStory: "Ce qui s'y passe",
};

export const DICTS: Record<Lang, Dict> = { en, fr };

export interface I18nValue {
  lang: Lang;
  t: Dict;
  setLang: (lang: Lang) => void;
}

export const I18nContext = createContext<I18nValue>({
  lang: 'en',
  t: en,
  setLang: () => {},
});

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}
