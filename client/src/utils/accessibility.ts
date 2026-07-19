let liveRegion: HTMLDivElement | null = null;

export function announceToScreenReader(message: string): void {
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.classList.add('sr-only');
    document.body.appendChild(liveRegion);
  }
  // Clear and then set to trigger announcement
  liveRegion.textContent = '';
  requestAnimationFrame(() => {
    if (liveRegion) {
      liveRegion.textContent = message;
    }
  });
}

export function getAriaSortLabel(direction: 'asc' | 'desc' | 'none'): string {
  switch (direction) {
    case 'asc': return '升序排列';
    case 'desc': return '降序排列';
    case 'none': return '未排序';
  }
}

let skipLinkId = 0;

export function generateSkipLinkId(): string {
  skipLinkId += 1;
  return `skip-link-${skipLinkId}`;
}
