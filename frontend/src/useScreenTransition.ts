import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';

// Fade the existing screen out before changing its height or scroll position.
// No height animation, layout loop, dependency or network delay is involved.
export function useScreenTransition() {
 const screen = useRef<HTMLElement>(null);
 const animation = useRef<Animation | undefined>(undefined);
 const revision = useRef(0);
 function cancelTransition() {
  revision.current++;
  animation.current?.cancel();
  animation.current = undefined;
 }
 useEffect(() => cancelTransition, []);
 async function transition(update: () => void, focus: () => void, isCurrent = () => true) {
  cancelTransition();
  const version = revision.current;
  const element = screen.current;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (element && !reduced && typeof element.animate === 'function') {
   animation.current = element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: 'forwards', easing: 'ease-out' });
   try { await animation.current.finished; } catch { return; }
  }
  if (version !== revision.current || !isCurrent()) { animation.current?.cancel(); return; }
  flushSync(update);
  focus();
  animation.current?.cancel();
  if (element && !reduced && typeof element.animate === 'function') {
   animation.current = element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
   try { await animation.current.finished; } catch { /* A newer interaction takes over. */ }
  }
 }
 return { screen, transition, cancelTransition };
}
