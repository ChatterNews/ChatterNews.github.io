#!/usr/bin/env node
/**
 * Pull the on-device models into apps/web/public/models so a school can serve
 * them from its own origin instead of a CDN. See apps/web/src/ml/model-runtime.ts.
 *
 *   npm run fetch-models
 *
 * Then build with VITE_MODEL_HOST=/models.
 */
import { mkdir, writeFile, stat, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../apps/web/public/models', import.meta.url));
const BASE = 'https://huggingface.co';

/** Files Transformers.js actually asks for, per model. */
export const MODELS = {
  'onnx-community/whisper-base': [
    'config.json', 'generation_config.json', 'preprocessor_config.json',
    'tokenizer.json', 'tokenizer_config.json',
    'onnx/encoder_model_fp16.onnx', 'onnx/decoder_model_merged_fp16.onnx',
  ],
  'onnx-community/whisper-tiny': [
    'config.json', 'generation_config.json', 'preprocessor_config.json',
    'tokenizer.json', 'tokenizer_config.json',
    'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx',
    'onnx/encoder_model_fp16.onnx', 'onnx/decoder_model_merged_fp16.onnx',
  ],
  'onnx-community/nsfw_image_detection-ONNX': [
    'config.json', 'preprocessor_config.json', 'onnx/model_q4.onnx',
  ],
};

// Importing the manifest for packaging must not start a download.
if (process.argv[1] === fileURLToPath(import.meta.url)) await fetchModels();

async function fetchModels() {
  let failures = 0;

  for (const [model, files] of Object.entries(MODELS)) {
    for (const file of files) {
      const url = `${BASE}/${model}/resolve/main/${file}`;
      const target = join(OUT, model, file);
      if ((await stat(target).catch(() => undefined))?.size) { console.log(`${model}/${file} … already present`); continue; }
      process.stdout.write(`${model}/${file} … `);
      try {
        let response;
        for (let attempt = 0; attempt < 3; attempt++) {
          response = await fetch(url);
          if (response.status !== 429 || attempt === 2) break;
          const retryAfter = Number(response.headers.get('retry-after'));
          const seconds = Math.max(30 * (attempt + 1), Number.isFinite(retryAfter) ? retryAfter : 0);
          if (seconds > 120) throw new Error(`Rate limited. Retry after ${seconds} seconds.`);
          console.log(`Rate limited; waiting ${seconds} seconds before retry.`);
          await new Promise((done) => setTimeout(done, seconds * 1000));
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(`${target}.part`, Buffer.from(await response.arrayBuffer()));
        await rename(`${target}.part`, target);
        console.log('ok');
      } catch (error) {
        failures++;
        console.log(`FAILED (${error.message})`);
      }
    }
  }

  if (failures) {
    console.error(`\n${failures} file(s) failed. Do not package an offline USB until every model file has downloaded successfully.`);
    process.exit(1);
  }
  console.log(`\nModels are in ${OUT}. Build with VITE_MODEL_HOST=/models`);

}
