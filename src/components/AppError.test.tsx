import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from './AppError';

function Broken(): never {
  throw new Error('nothing to see');
}

describe('AppError', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('keeps the page readable when a screen throws', () => {
    render(
      <AppError>
        <Broken />
      </AppError>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t open this screen');

    expect(screen.getByRole('alert')).not.toHaveTextContent('nothing to see');
    expect(screen.getByRole('button', { name: 'Reload Wave' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try this screen again' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Return to Home' })).toHaveAttribute('href', '/');
  });

  it('draws its children when nothing is wrong', () => {
    render(
      <AppError>
        <p>the library</p>
      </AppError>,
    );
    expect(screen.getByText('the library')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
