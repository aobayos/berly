// localStorage behind secure-ls's AES encoding. The key lives in the same
// localStorage, so this keeps data from being readable at a glance in devtools
// or on disk — obfuscation, not protection from anyone with access to the
// browser profile.
import SecureLSModule from 'secure-ls';

// The package's CommonJS build exports `{ default: SecureLS }` without marking
// itself as an ES module, so Vite hands the default import that wrapper rather
// than the class its typings promise. Unwrap it, and accept the class as-is in
// case a later release fixes the build.
const SecureLS = (SecureLSModule as unknown as { default?: typeof SecureLSModule }).default ?? SecureLSModule;

const ls = new SecureLS({ encodingType: 'aes' });

export const SecureStorage = {
	/** Values written before encryption was introduced are plain JSON, which
	 * secure-ls refuses to read; those are parsed directly and re-stored
	 * encrypted, so the browser library survives the switch. */
	get<T>(key: string): T | null {
		const stored = localStorage.getItem(key);
		if (stored === null) return null;
		try {
			const value = ls.get(key);
			return value === '' ? null : (value as T);
		} catch {
			try {
				const value = JSON.parse(stored) as T;
				ls.set(key, value);
				return value;
			} catch {
				return null;
			}
		}
	},

	set<T>(key: string, value: T): void {
		ls.set(key, value);
	},

	remove(key: string): void {
		ls.remove(key);
	},
};
