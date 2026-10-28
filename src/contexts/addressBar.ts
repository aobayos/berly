// Browser build only: the address bar follows the active tab — `#/` on Home,
// `#/project/<id>/…` inside a project — and moves the tabs in turn when the
// writer uses Back/Forward, reloads, or opens a bookmarked link. Each tab keeps
// its own in-memory router (several projects are open at once, and one
// address bar can only show one of them); this mirrors whichever is in front.
// A hash rather than a path, because the build is served from a relative base
// (see vite.config.ts) and a path would 404 on reload from a static host.
import { useEffect, useRef } from 'react';
import { useTabs } from '@/contexts/tabs';

const PROJECT_ROUTE = /^\/project\/([^/]+)(?:\/script\/[^/]+)?$/;

function currentRoute(): string {
	return decodeURI(window.location.hash.replace(/^#/, ''));
}

export function useAddressBar(enabled: boolean): void {
	const { activeTab, openProject, activate } = useTabs();
	const route = activeTab ? activeTab.path : '/';

	// Latest values for the popstate listener, which subscribes once.
	const latest = useRef({ openProject, activate });
	latest.current = { openProject, activate };

	// Address bar → tabs: on load, and on Back/Forward or an edited URL.
	useEffect(() => {
		if (!enabled) return;
		const apply = () => {
			const target = currentRoute();
			// No hash at all (a bare first visit): leave the restored session be.
			if (!target) return;
			const match = PROJECT_ROUTE.exec(target);
			if (match) latest.current.openProject(match[1], { path: target });
			else latest.current.activate(null);
		};
		apply();
		window.addEventListener('popstate', apply);
		return () => window.removeEventListener('popstate', apply);
	}, [enabled]);

	// Tabs → address bar. A new step in the browser's history for every real
	// move, but not for redirects, or Back would land on the redirect and be
	// bounced straight forward again.
	const shown = useRef<{ tabId: string | null } | null>(null);
	const tabId = activeTab?.id ?? null;
	const lastNav = activeTab?.lastNav;
	useEffect(() => {
		if (!enabled) return;
		const previous = shown.current;
		shown.current = { tabId };
		if (currentRoute() === route) return;
		const url = `#${encodeURI(route)}`;
		if (!previous) {
			// First render. A hash that was already there wins: the effect above
			// is bringing the tabs to it, so don't overwrite it with the session.
			if (!currentRoute()) window.history.replaceState(null, '', url);
			return;
		}
		// Only a move inside the same tab can be a redirect; switching tabs is
		// always a step the writer took.
		if (previous.tabId === tabId && lastNav === 'replace') {
			window.history.replaceState(null, '', url);
		} else {
			window.history.pushState(null, '', url);
		}
	}, [enabled, route, tabId, lastNav]);
}
