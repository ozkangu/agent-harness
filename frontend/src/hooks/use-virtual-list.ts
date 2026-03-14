import { useRef } from "react";
import { useVirtualizer, type VirtualizerOptions } from "@tanstack/react-virtual";

interface UseVirtualListOptions {
  count: number;
  estimateSize: (index: number) => number;
  overscan?: number;
  enabled?: boolean;
}

export function useVirtualList({
  count,
  estimateSize,
  overscan = 5,
  enabled = true,
}: UseVirtualListOptions) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: enabled ? count : 0,
    getScrollElement: () => parentRef.current,
    estimateSize,
    overscan,
  });

  return {
    parentRef,
    virtualizer,
    virtualItems: virtualizer.getVirtualItems(),
    totalSize: virtualizer.getTotalSize(),
  };
}
