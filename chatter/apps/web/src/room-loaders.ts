import { createElement, lazy, type ComponentType, type LazyExoticComponent } from 'react';

/** Pick a named room export without evaluating its module at app startup. */
export function lazyNamed<T extends ComponentType<any> = ComponentType<any>>(
  importer: () => Promise<Record<string, unknown>>,
  exportName: string,
): LazyExoticComponent<T> {
  return lazy(async () => {
    let module: Record<string, unknown>;
    try { module = await importer(); }
    catch (error) {
      if (import.meta.env.VITE_ORBIT_WEB !== 'true') throw error;
      // Keep the shell and Files alive when an unvisited room is unavailable.
      module = { [exportName]: () => createElement('section', { className: 'room-loading', role: 'alert' },
        createElement('h2', null, 'This room has not loaded yet.'),
        createElement('p', null, 'Reconnect to load its tools. Files is still available to save your work before reloading.'),
        createElement('button', { onClick: () => window.location.reload() }, 'Reload Orbit'),
      ) };
    }
    const component = module[exportName];
    if (typeof component !== 'function' && typeof component !== 'object') {
      throw new Error(`Room module does not export ${exportName}`);
    }
    return { default: component as T };
  });
}
