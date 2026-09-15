/** Enter only after the site's gateway controls requests, before mounting stores. */
export async function launchWebsite({ base, releaseId, connect, route = '', local = localStorage, session = sessionStorage, navigate = url => window.location.replace(url), newId = () => crypto.randomUUID() }) {
  await connect();
  let id = local.getItem('orbit-web-workspace-id');
  if (!id) { id = newId(); local.setItem('orbit-web-workspace-id', id); }
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) throw new Error('The local desk reference could not be read. Keep your saved files and ask your advisor for help.');
  session.setItem('orbit-reader-current', JSON.stringify({ workspaceId: id, releaseId }));
  const url = new URL(`r/${releaseId}/`, base);
  if (route.startsWith('#/')) url.hash = route;
  navigate(url.href);
}
