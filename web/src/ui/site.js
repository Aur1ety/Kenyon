// Links the page uses. The repository is public; every cited file can be opened there.
export const REPO = 'https://github.com/Aur1ety/Kenyon';

/** A link to a file in the repository (e.g. 'results/mb_seeds.json' or 'docs/RESULTS.md'). */
export const repoFile = (path) => `${REPO}/blob/main/${path}`;
