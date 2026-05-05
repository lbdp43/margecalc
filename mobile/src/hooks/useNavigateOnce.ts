import { useCallback, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';

/**
 * Prevents double-tap navigation by debouncing navigate calls.
 * Returns a navigate function that ignores calls within 500ms of the last one.
 */
export function useNavigateOnce() {
  const navigation = useNavigation<any>();
  const lastNavTime = useRef(0);

  const navigate = useCallback((...args: Parameters<typeof navigation.navigate>) => {
    const now = Date.now();
    if (now - lastNavTime.current < 500) return;
    lastNavTime.current = now;
    navigation.navigate(...args);
  }, [navigation]);

  return navigate;
}
