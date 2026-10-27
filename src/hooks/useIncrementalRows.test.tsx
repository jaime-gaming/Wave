import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIncrementalRows } from './useIncrementalRows';

function List({ total }: { total: number }) {
  const { limit, sentinelRef } = useIncrementalRows(total, 10);
  const items = Array.from({ length: limit }, (_, i) => i);
  return (
    <ul>
      {items.map((i) => (
        <li key={i}>row {i}</li>
      ))}
      {limit < total && <li ref={sentinelRef}>more</li>}
    </ul>
  );
}

const observers: IntersectionObserverCallback[] = [];

class StubObserver {
  constructor(callback: IntersectionObserverCallback) {
    observers.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  observers.length = 0;
});

describe('incremental rows', () => {
  it('renders one page of rows and the rest as the list is scrolled', () => {
    vi.stubGlobal('IntersectionObserver', StubObserver);
    render(<List total={25} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(11);
    act(() =>
      observers[0](
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(21);
  });

  it('renders everything when the list is short', () => {
    vi.stubGlobal('IntersectionObserver', StubObserver);
    render(<List total={4} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByText('more')).not.toBeInTheDocument();
  });
});
