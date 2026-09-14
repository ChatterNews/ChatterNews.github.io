export type ProjectDriveDismissSource = 'CLOSE_BUTTON' | 'ESCAPE' | 'BACKDROP' | 'DIALOG_CONTENT';

export function projectDrivePortalTarget(documentTarget: Document): HTMLElement {
  return documentTarget.body;
}

export function shouldDismissProjectDrive(source: ProjectDriveDismissSource): boolean {
  return source !== 'DIALOG_CONTENT';
}
