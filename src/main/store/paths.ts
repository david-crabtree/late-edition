import { join } from 'node:path';

/**
 * Canonical on-disk layout for a newsroom. Everything is a plain file the user can
 * open, grep, back up and commit. See docs/build-plan.md §9.3.
 */
export function paths(root: string) {
  const newsroom = join(root, 'newsroom');
  return {
    root,
    newsroom,
    configFile: join(newsroom, 'config.yaml'),
    staffFile: join(newsroom, 'staff.yaml'),
    styleFile: join(newsroom, 'style.md'),
    beatsDir: join(newsroom, 'beats'),
    personasDir: join(newsroom, 'staff'),
    /** Raw signals, before anyone has looked at them. */
    wireDir: join(root, 'wire'),
    /** Persistent adapter "seen" state, one JSON file per source. */
    stateDir: join(root, 'wire', '.state'),
    editionsDir: join(root, 'editions'),
    /** Directory for a specific edition. */
    editionDir(editionId: string) {
      return join(root, 'editions', editionId);
    },
    storyDir(editionId: string, slug: string) {
      return join(root, 'editions', editionId, 'stories', slug);
    },
  };
}

export type NewsroomPaths = ReturnType<typeof paths>;
