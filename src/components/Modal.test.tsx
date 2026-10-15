import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Modal } from './Modal';

it('distinguishes native dialog padding from backdrop clicks', () => {
  const close = vi.fn();
  render(
    <Modal title="Draft" onClose={close}>
      <p>Unsaved work</p>
    </Modal>,
  );
  const dialog = screen.getByRole('dialog');
  vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
    left: 20,
    right: 300,
    top: 30,
    bottom: 400,
  } as DOMRect);
  fireEvent.pointerDown(dialog, { clientX: 25, clientY: 35 });
  fireEvent.click(dialog, { clientX: 25, clientY: 35 });
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Unsaved work'), { clientX: 0, clientY: 0 });
  expect(close).not.toHaveBeenCalled();
  fireEvent.pointerDown(dialog, { clientX: 25, clientY: 35 });
  fireEvent.click(dialog, { clientX: 10, clientY: 35 });
  expect(close).not.toHaveBeenCalled();
  fireEvent.pointerDown(dialog, { clientX: 10, clientY: 35 });
  fireEvent.pointerCancel(dialog);
  fireEvent.click(dialog, { clientX: 10, clientY: 35 });
  expect(close).not.toHaveBeenCalled();
  fireEvent.pointerDown(dialog, { clientX: 10, clientY: 35 });
  fireEvent.click(dialog, { clientX: 10, clientY: 35 });
  expect(close).toHaveBeenCalledOnce();
});
