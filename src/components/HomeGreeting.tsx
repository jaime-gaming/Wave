import { useEffect, useState } from 'react';
import { useWaveMotion } from '../ui/motion';

/** A welcome in the page title, not an extra banner taking space from the library. */
export function HomeGreeting({
  home,
  greeting,
  active = true,
}: {
  home: string;
  greeting: string;
  active?: boolean;
}) {
  const [showGreeting, setShowGreeting] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const animation = useWaveMotion();
  useEffect(() => {
    if (!active) return;
    let finish: number | undefined;
    const timer = window.setTimeout(() => {
      if (!animation.enabled) {
        setShowGreeting(false);
        return;
      }
      setLeaving(true);
      finish = window.setTimeout(() => {
        setShowGreeting(false);
        setLeaving(false);
      }, 180);
    }, 4000);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(finish);
    };
  }, [active, animation.enabled]);
  return (
    <span
      key={showGreeting ? 'greeting' : 'home'}
      className={`home-greeting-title ${leaving ? 'is-leaving' : ''}`}
    >
      {showGreeting ? greeting : home}
    </span>
  );
}
