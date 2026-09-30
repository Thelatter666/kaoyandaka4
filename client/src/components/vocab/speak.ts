/**
 * 单词发音（零新依赖）：Web Speech API，固定 en-US。
 *
 * 约定：
 * - 先 cancel() 再 speak()：连点发音钮不排队、不叠读；
 * - 环境不支持（无 speechSynthesis / 无 SpeechSynthesisUtterance）或引擎抛错时静默 no-op，
 *   发音是锦上添花，绝不阻断查词/复习主流程。
 */

export function speakWord(word: string): void {
  if (typeof window === 'undefined') return;
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
  const text = word.trim();
  if (!text) return;
  try {
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    /* 略慢于默认语速，便于跟读 */
    utterance.rate = 0.95;
    synth.speak(utterance);
  } catch {
    /* 语音引擎异常：按 no-op 处理 */
  }
}
