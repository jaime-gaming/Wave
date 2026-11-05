import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { LocalMetadataReview } from './LocalMetadataReview';
import { makeTrack } from '../test/fixtures';

it('lets the listener resolve an ambiguous filename in either direction without network consent', async () => {
  const resolve = vi.fn().mockResolvedValue(true);
  render(
    <LocalMetadataReview
      tracks={[
        makeTrack({ title: 'Nils Frahm', artist: 'Says', fileName: 'Nils Frahm - Says.mp3' }),
      ]}
      enabled={false}
      onResolveRoles={resolve}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Swap title and artist' }));
  expect(resolve).toHaveBeenCalledWith('signal', 'swap');
  await userEvent.click(screen.getByRole('button', { name: 'These details are correct' }));
  expect(resolve).toHaveBeenCalledWith('signal', 'keep');
});
