import { useCallback, type KeyboardEvent } from 'react';

const ARROW_KEYS = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'];

/**
 * Roving arrow-key navigation for a grid of focusable elements marked with
 * `[data-nav]`. Left/Right move by one; Up/Down jump by a row, with the column
 * count inferred from the rendered layout. This is what makes the channel grid
 * usable from a TV remote, where there is no pointer.
 */
export function useGridNavigation<T extends HTMLElement>() {
  return useCallback((event: KeyboardEvent<T>) => {
    if (!ARROW_KEYS.includes(event.key)) return;

    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[data-nav]'),
    );
    const current = document.activeElement as HTMLElement | null;
    const index = current ? items.indexOf(current) : -1;
    if (index === -1) return;

    const firstTop = items[0].offsetTop;
    let columns = items.findIndex((el) => el.offsetTop > firstTop);
    if (columns === -1) columns = items.length;

    let next = index;
    switch (event.key) {
      case 'ArrowRight':
        next = index + 1;
        break;
      case 'ArrowLeft':
        next = index - 1;
        break;
      case 'ArrowDown':
        next = index + columns;
        break;
      case 'ArrowUp':
        next = index - columns;
        break;
    }

    // Only take over when there's a target inside the grid; at the edges let the
    // event bubble so a TV browser's native spatial nav can leave the grid
    // (e.g. up to the nav bar).
    if (next >= 0 && next < items.length) {
      event.preventDefault();
      items[next].focus();
    }
  }, []);
}
