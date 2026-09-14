import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/** Pick a named room export without evaluating its module at app startup. */
export function lazyNamed<T extends ComponentType<any> = ComponentType<any>>(
  importer: () => Promise<Record<string, unknown>>,
  exportName: string,
): LazyExoticComponent<T> {
  return lazy(async () => {
    const module = await importer();
    const component = module[exportName];
    if (typeof component !== 'function' && typeof component !== 'object') {
      throw new Error(`Room module does not export ${exportName}`);
    }
    return { default: component as T };
  });
}
