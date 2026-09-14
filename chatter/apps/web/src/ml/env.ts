/**
 * Where the models are fetched from.
 *
 * SPEC S9, Tier 0: "Serve the model from the same origin and pre-warm the cart
 * if you can." Twenty Chromebooks pulling ~150 MB off a CDN at once is a bad
 * afternoon, and it means first run needs the internet at all.
 *
 * So the host is configurable:
 *
 *   unset            fetch from the Hugging Face CDN (fine for one machine)
 *   VITE_MODEL_HOST  fetch from your own origin, e.g. "/models"
 *
 * `npm run fetch-models` fills apps/web/public/models so "/models" works
 * offline. The weights are deliberately not in git - they are large, and they
 * are not ours.
 */
import { env } from '@huggingface/transformers';

const host = import.meta.env.VITE_MODEL_HOST as string | undefined;

export function configureModelHost(): { servedLocally: boolean; from: string } {
  if (host) {
    // Same-origin: no CDN, no internet needed after the first load.
    env.allowRemoteModels = true;
    env.remoteHost = host.endsWith('/') ? host.slice(0, -1) : host;
    env.remotePathTemplate = '{model}';
    return { servedLocally: true, from: env.remoteHost };
  }

  return { servedLocally: false, from: env.remoteHost ?? 'the Hugging Face CDN' };
}
