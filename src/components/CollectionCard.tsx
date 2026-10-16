import { motion } from 'motion/react';
import { Artwork } from './Artwork';
import { useWaveMotion } from '../ui/motion';
import type { AlbumGroup } from '../domain/collections';

export function AlbumCard({ album, onOpen }: { album: AlbumGroup; onOpen: (id: string) => void }) {
  const animation = useWaveMotion();
  return (
    <motion.button
      className="group-card album-card"
      aria-label={`${album.name} ${album.artist}`}
      onClick={() => onOpen(album.id)}
      initial={animation.enabled ? { opacity: 0, y: 16, scale: 0.96 } : { opacity: 1 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={animation.enabled ? { y: -4 } : undefined}
      whileTap={animation.enabled ? { scale: 0.94, rotate: -1 } : undefined}
      transition={animation.fast}
    >
      <Artwork track={album.cover} />
      <strong>{album.name}</strong>
      <span>{album.artist}</span>
    </motion.button>
  );
}
