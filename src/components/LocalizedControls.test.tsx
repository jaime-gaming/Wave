import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { makeTrack } from '../test/fixtures';
import { AudioTrimEditor } from './AudioTrimEditor';
import { LibraryContent } from './LibraryContent';

afterEach(() => localStorage.clear());

it('localizes actionable names in the library and the trim editor', () => {
  localStorage.setItem('wave-language', 'es');
  const track = makeTrack({ title: 'Signal', artist: 'Wave', album: 'Light' });
  render(
    <I18nProvider>
      <LibraryContent
        tracks={[track]}
        total={1}
        loading={false}
        busy={false}
        view="songs"
        query=""
        group={null}
        onGroup={vi.fn()}
        onClearSearch={vi.fn()}
        onAdd={vi.fn()}
        playing={false}
        onPlay={vi.fn()}
        onFavorite={vi.fn()}
        onMore={vi.fn()}
      />
      <AudioTrimEditor track={track} onChange={vi.fn()} />
    </I18nProvider>,
  );
  expect(screen.getByRole('button', { name: 'Reproducir Signal de Wave' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Abrir artista Wave' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Abrir álbum Light' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Opciones de Signal' })).toBeInTheDocument();
  expect(screen.getByRole('slider', { name: 'Recortar inicio' })).toBeInTheDocument();
  expect(screen.getByRole('slider', { name: 'Recortar final' })).toBeInTheDocument();
});

it('translates daily mix headings, actions and section name', async () => {
  localStorage.setItem('wave-language', 'es');
  const { DailyMixPage } = await import('./DailyMixPage');
  const track = makeTrack();
  render(
    <I18nProvider>
      <DailyMixPage
        selection={{
          number: 1,
          mix: {
            id: 'daily',
            label: 'Rock',
            basis: 'genre',
            tracks: [track],
            covers: [track],
            descriptor: 'Rock',
          },
        }}
        tracks={[track]}
        playing={false}
        onBack={vi.fn()}
        onPlay={vi.fn()}
        onShuffle={vi.fn()}
        onFavorite={vi.fn()}
        onMore={vi.fn()}
        onArtist={vi.fn()}
        onAlbum={vi.fn()}
        onSave={vi.fn(async () => true)}
      />
    </I18nProvider>,
  );
  expect(screen.getByRole('region', { name: 'Lista de mezcla diaria 1' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Mezcla diaria 1' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reproducir la mezcla' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Volver a Inicio' })).toBeInTheDocument();
});
