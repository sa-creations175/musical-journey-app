/**
 * What every test file needs from a browser that jsdom does not have.
 *
 * =====================================================================
 * ONE STUB, NOT ELEVEN (ruling 47).
 *
 * `AnswerKeyboard` measures its host with a `ResizeObserver`, and jsdom
 * has none. Eleven test files carried their own copy of the same
 * four-line class, and the twelfth and thirteenth were added the day a
 * pair of harmonic-fluency page tests turned out to fail about one run
 * in three — not because anything had changed, but because whether the
 * scheduler served a "press the number" card decided whether the
 * keyboard rendered at all. A stub every test file has is a stub no
 * test file has to remember.
 *
 * =====================================================================
 * NOTHING ELSE MOVES IN HERE, and that is the ruling as well as good
 * sense. A setup file is invisible from the test that depends on it, so
 * every line in it is a fact a reader has to already know. It earns its
 * place only for something that is true of the ENVIRONMENT rather than
 * of any test — a browser API jsdom is missing is exactly that; a
 * fixture, a mock or a default is not.
 *
 * =====================================================================
 * ASSIGNED RATHER THAN `vi.stubGlobal`-ED, which is the one difference
 * from the copies it replaces. `vi.unstubAllGlobals()` — which a test
 * may reasonably call — would take a stub back out and leave every
 * later test in that file without it. A plain assignment is not a stub
 * and cannot be un-stubbed.
 *
 * It is also conditional: a real `ResizeObserver` belongs to the
 * environment, and replacing one that exists would be this file having
 * an opinion about a browser rather than filling a gap in one.
 */
class NoopResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = NoopResizeObserver;
}
