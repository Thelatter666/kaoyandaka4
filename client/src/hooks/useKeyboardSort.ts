import { useState, useCallback, useRef } from 'react';

interface UseKeyboardSortOptions {
  itemCount: number;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

interface UseKeyboardSortReturn {
  activeIndex: number | null;
  handleKeyDown: (index: number, e: React.KeyboardEvent) => void;
  enterSortMode: (index: number) => void;
  exitSortMode: () => void;
}

export function useKeyboardSort({
  itemCount,
  onReorder,
}: UseKeyboardSortOptions): UseKeyboardSortReturn {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const originalIndexRef = useRef<number | null>(null);

  const enterSortMode = useCallback((index: number) => {
    setActiveIndex(index);
    originalIndexRef.current = index;
  }, []);

  const exitSortMode = useCallback(() => {
    setActiveIndex(null);
    originalIndexRef.current = null;
  }, []);

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (activeIndex === null) {
        // Not in sort mode
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          enterSortMode(index);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        exitSortMode();
        return;
      }

      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        // Confirm position
        if (activeIndex !== originalIndexRef.current) {
          onReorder(originalIndexRef.current!, activeIndex);
        }
        exitSortMode();
        return;
      }

      if (e.key === 'ArrowUp' && activeIndex > 0) {
        e.preventDefault();
        setActiveIndex(activeIndex - 1);
        return;
      }

      if (e.key === 'ArrowDown' && activeIndex < itemCount - 1) {
        e.preventDefault();
        setActiveIndex(activeIndex + 1);
        return;
      }
    },
    [activeIndex, itemCount, onReorder, enterSortMode, exitSortMode]
  );

  return { activeIndex, handleKeyDown, enterSortMode, exitSortMode };
}
