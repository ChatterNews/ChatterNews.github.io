import { describe, expect, it } from 'vitest';
import { projectDrivePortalTarget, shouldDismissProjectDrive } from './project-drive-dialog.js';

describe('Story Drive dialog behavior', () => {
  it('mounts the fixed overlay at the document body instead of inside the top bar', () => {
    const body = {} as HTMLElement;
    expect(projectDrivePortalTarget({ body } as Document)).toBe(body);
  });

  it('can always be dismissed by its close controls', () => {
    expect(shouldDismissProjectDrive('CLOSE_BUTTON')).toBe(true);
    expect(shouldDismissProjectDrive('ESCAPE')).toBe(true);
    expect(shouldDismissProjectDrive('BACKDROP')).toBe(true);
    expect(shouldDismissProjectDrive('DIALOG_CONTENT')).toBe(false);
  });
});
