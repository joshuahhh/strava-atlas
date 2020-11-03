import m from 'mithril';
import Stream from 'mithril/stream';

export function toggle<T>(t$: Stream<T | undefined>, t: T | undefined): void {
  t$(t$() == t ? undefined : t);
}

export function redrawOn(...streams: Stream<any>[]): void {
  streams.forEach(t$ => {
    t$.map(() => m.redraw());
  });
}