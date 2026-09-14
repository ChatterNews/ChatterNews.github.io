export interface WorkletContext {
  readonly audioWorklet: { addModule(url: string): Promise<void> };
}

/**
 * A processor module is registered per BaseAudioContext, even when the engine's
 * compiled WASM is cached for the whole page. This coordinator keeps those two
 * readiness levels separate and serializes the one-time shared compilation.
 */
export class PerContextWorkletLoader<TContext extends object & WorkletContext> {
  readonly #processorUrl: string;
  readonly #readyContexts = new WeakSet<TContext>();
  #compiling?: Promise<{ context: TContext; ready: boolean }>;

  constructor(processorUrl: string) {
    this.#processorUrl = processorUrl;
  }

  async ensure(
    context: TContext,
    sharedReady: () => boolean,
    bootstrap: (context: TContext) => Promise<boolean>,
  ): Promise<boolean> {
    if (this.#readyContexts.has(context)) return true;

    if (!sharedReady()) {
      const compiling = this.#compiling ??= bootstrap(context).then((ready) => ({ context, ready }));
      let result: { context: TContext; ready: boolean };
      try {
        result = await compiling;
      } finally {
        if (this.#compiling === compiling) this.#compiling = undefined;
      }
      if (!result.ready) return false;
      this.#readyContexts.add(result.context);
    }

    if (!this.#readyContexts.has(context)) {
      await context.audioWorklet.addModule(this.#processorUrl);
      this.#readyContexts.add(context);
    }
    return true;
  }
}
