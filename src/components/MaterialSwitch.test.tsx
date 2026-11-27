import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MaterialSwitch } from './MaterialSwitch';

describe('MaterialSwitch', () => {
  it('toggles on ordinary clicks', () => {
    const onChange = vi.fn();
    render(<MaterialSwitch label="Mix" checked={false} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Mix' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('supports horizontal pointer dragging across the track without double-toggling', () => {
    const onChange = vi.fn();
    render(<MaterialSwitch label="Autoplay" checked={false} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Autoplay' });

    fireEvent.pointerDown(toggle, { pointerId: 1, button: 0, clientX: 100 });
    fireEvent.pointerMove(toggle, { pointerId: 1, clientX: 120 });
    expect(toggle).toHaveClass('is-dragging');
    fireEvent.pointerUp(toggle, { pointerId: 1, clientX: 120 });

    fireEvent.click(toggle);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('snaps back when dragged past half back to off', () => {
    const onChange = vi.fn();
    render(<MaterialSwitch label="Animations" checked={true} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: 'Animations' });

    fireEvent.pointerDown(toggle, { pointerId: 2, button: 0, clientX: 120 });
    fireEvent.pointerMove(toggle, { pointerId: 2, clientX: 100 });
    fireEvent.pointerUp(toggle, { pointerId: 2, clientX: 100 });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
