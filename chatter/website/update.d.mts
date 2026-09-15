export function activeWebsiteRelease(serviceWorker: ServiceWorkerContainer, timeoutMs?: number): Promise<string | undefined>;
export function checkWebsiteUpdate(base: URL, options?: { serviceWorker?: ServiceWorkerContainer; timeoutMs?: number }): Promise<string | undefined>;
