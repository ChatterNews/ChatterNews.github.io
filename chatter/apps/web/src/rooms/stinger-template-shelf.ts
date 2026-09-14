export function isStingerTemplateShelfVisible(input: { hasOpenProject: boolean; shelfRequested: boolean }) {
  return !input.hasOpenProject || input.shelfRequested;
}
