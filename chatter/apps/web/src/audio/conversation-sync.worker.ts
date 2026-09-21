import { matchConversation, speechFeatures, type SpeechFeatures } from './conversation-sync.js';
self.onmessage = (event: MessageEvent<{ type: 'FEATURES'; channels: Float32Array[]; rate: number } | { type: 'MATCH'; reference: SpeechFeatures; source: SpeechFeatures }>) => {
  try {
    const input = event.data;
    const result = input.type === 'FEATURES' ? speechFeatures(input.channels, input.rate) : matchConversation(input.reference, input.source);
    self.postMessage({ result });
  } catch { self.postMessage({ error: 'Audio comparison could not finish. Try fewer or shorter recordings.' }); }
};
