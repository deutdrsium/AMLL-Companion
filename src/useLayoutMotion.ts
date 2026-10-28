import {useLayoutEffect, useRef} from 'react';

// FLIP the existing nodes at layout breakpoints, keeping the lyric player mounted.
export function useLayoutMotion(width: number, height: number, mini: boolean, focus: boolean, reduceMotion: boolean) {
  const previous = useRef(new Map<HTMLElement, DOMRect>());
  const mode = useRef('');
  const animations = useRef<Animation[]>([]);
  useLayoutEffect(() => {
    const nextMode = `${mini ? 'mini' : width <= 800 ? 'stacked' : 'wide'}:${focus}`;
    if (mode.current === nextMode && !reduceMotion && animations.current.some(animation => animation.playState === 'running')) return;
    animations.current.forEach(animation => animation.cancel());
    animations.current = [];
    const next = new Map<HTMLElement, DOMRect>();
    document.querySelectorAll<HTMLElement>('.artwork, .track-info, .timeline, .transport, .lyrics-panel').forEach(element => {
      const rect = element.getBoundingClientRect();
      const before = previous.current.get(element);
      next.set(element, rect);
      if (before && mode.current !== nextMode && !reduceMotion && !matchMedia('(prefers-reduced-motion: reduce)').matches
          && before.width && before.height && rect.width && rect.height) {
        const base = getComputedStyle(element).transform;
        // AMLL measures glyph widths during resize; ancestor scaling would cache extra line breaks.
        const scale = element.matches('.lyrics-panel') ? '' : `scale(${before.width/rect.width}, ${before.height/rect.height})`;
        animations.current.push(element.animate([
          {transform: `translate(${before.x-rect.x}px, ${before.y-rect.y}px) ${scale} ${base === 'none' ? '' : base}`},
          {transform: base},
        ], {duration: 360, easing: 'cubic-bezier(.22, 1, .36, 1)'}));
      }
    });
    previous.current = next;
    mode.current = nextMode;
    const batch = animations.current;
    if (batch.length) void Promise.all(batch.map(animation => animation.finished)).then(() => {
      if (animations.current === batch) previous.current = new Map([...next.keys()].map(element => [element, element.getBoundingClientRect()]));
    }).catch(() => {});
  }, [width, height, mini, focus, reduceMotion]);
  useLayoutEffect(() => () => animations.current.forEach(animation => animation.cancel()), []);
}
