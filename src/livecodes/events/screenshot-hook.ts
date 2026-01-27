export type ScreenshotAttemptCallback = (event: {
  key: string;
  shortcut: string;
  platform: 'mac' | 'windows' | 'other';
  prevented: boolean;
}) => void;

const screenshotHooks: ScreenshotAttemptCallback[] = [];

export const onScreenshotAttempt = (callback: ScreenshotAttemptCallback): (() => void) => {
  screenshotHooks.push(callback);
  return () => {
    const index = screenshotHooks.indexOf(callback);
    if (index > -1) {
      screenshotHooks.splice(index, 1);
    }
  };
};

export const triggerScreenshotHooks = (event: {
  key: string;
  shortcut: string;
  platform: 'mac' | 'windows' | 'other';
  prevented: boolean;
}): void => {
  screenshotHooks.forEach((callback) => {
    try {
      callback(event);
    } catch (e) {
      console.error('Screenshot hook error:', e);
    }
  });
};

export const isScreenshotShortcut = (
  e: KeyboardEvent,
): { isScreenshot: boolean; shortcut: string; platform: 'mac' | 'windows' | 'other' } => {
  if (e.metaKey && e.shiftKey && ['2', '3', '4', '5'].includes(e.key)) {
    return {
      isScreenshot: true,
      shortcut: `Cmd+Shift+${e.key}`,
      platform: 'mac',
    };
  }

  if (e.key === 'PrintScreen') {
    return {
      isScreenshot: true,
      shortcut: 'PrintScreen',
      platform: 'windows',
    };
  }

  if (e.metaKey && e.shiftKey && e.key.toLowerCase() === 's') {
    return {
      isScreenshot: true,
      shortcut: 'Win+Shift+S',
      platform: 'windows',
    };
  }

  return { isScreenshot: false, shortcut: '', platform: 'other' };
};

export const clearScreenshotHooks = (): void => {
  screenshotHooks.length = 0;
};

/**
 * Initialize screenshot protection for result mode
 * Uses multiple detection methods with an overlay shield
 * Also listens to messages from iframe for screenshot detection
 */
export const initScreenshotProtection = (
  getMode: () => string,
  _getResultElement?: () => HTMLElement | null,
): (() => void) => {
  let overlay: HTMLDivElement | null = null;
  let isShiftPressed = false;
  let isMetaPressed = false;
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  // Create protection overlay
  const createOverlay = () => {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'screenshot-protection-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: #1e1e1e;
      z-index: 999999;
      display: none;
      align-items: center;
      justify-content: center;
      color: #666;
      font-size: 18px;
      font-family: system-ui, -apple-system, sans-serif;
    `;
    overlay.innerHTML = '<div>Screenshot disabled</div>';
    document.body.appendChild(overlay);
    return overlay;
  };

  const showOverlay = () => {
    if (getMode() !== 'result') return;
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    const el = createOverlay();
    el.style.display = 'flex';
  };

  const hideOverlay = () => {
    if (hideTimeout) clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      if (overlay) {
        overlay.style.display = 'none';
      }
    }, 200);
  };

  // Detect Shift key press (screenshot shortcuts all use Shift)
  const handleKeyDown = (e: KeyboardEvent) => {
    if (getMode() !== 'result') return;

    if (e.key === 'Shift') {
      isShiftPressed = true;
    }
    if (e.key === 'Meta' || e.key === 'Control') {
      isMetaPressed = true;
    }

    // Show overlay immediately when Cmd/Ctrl + Shift is pressed
    if (isShiftPressed && isMetaPressed) {
      showOverlay();
    }

    // Also catch the actual screenshot keys
    if (e.metaKey && e.shiftKey) {
      showOverlay();
    }

    // Windows PrintScreen
    if (e.key === 'PrintScreen') {
      showOverlay();
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Shift') {
      isShiftPressed = false;
    }
    if (e.key === 'Meta' || e.key === 'Control') {
      isMetaPressed = false;
    }

    // Hide overlay when keys are released
    if (!isShiftPressed || !isMetaPressed) {
      hideOverlay();
    }
  };

  // Detect window blur (happens during Mac screenshot)
  const handleBlur = () => {
    if (getMode() !== 'result') return;
    showOverlay();
  };

  const handleFocus = () => {
    isShiftPressed = false;
    isMetaPressed = false;
    hideOverlay();
  };

  // Detect visibility change
  const handleVisibilityChange = () => {
    if (getMode() !== 'result') return;
    if (document.hidden) {
      showOverlay();
    } else {
      hideOverlay();
    }
  };

  // Listen for messages from iframe about screenshot attempts
  const handleMessage = (event: MessageEvent) => {
    if (event.data?.type === 'screenshotAttempt') {
      if (event.data.payload?.show) {
        showOverlay();
      } else {
        hideOverlay();
      }
    }
  };

  // Use capture phase for fastest detection
  window.addEventListener('keydown', handleKeyDown, true);
  window.addEventListener('keyup', handleKeyUp, true);
  window.addEventListener('blur', handleBlur);
  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('message', handleMessage);

  // Cleanup function
  return () => {
    window.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('keyup', handleKeyUp, true);
    window.removeEventListener('blur', handleBlur);
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('message', handleMessage);
    if (hideTimeout) clearTimeout(hideTimeout);
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  };
};
