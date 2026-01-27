import { handleEval, handleResize, handleScrollPosition, proxyConsole } from './utils';

(() => {
  (window as any).livecodes = (window as any).livecodes || {};
  // avoid duplicate handlers in live reload
  if ((window as any).livecodes.env === 'development') return;
  (window as any).livecodes.env = 'development';

  proxyConsole();
  handleEval();
  handleResize();
  handleScrollPosition();

  // Screenshot protection - detect keyboard shortcuts inside iframe
  let isShiftPressed = false;
  let isMetaPressed = false;

  const notifyScreenshotAttempt = (show: boolean) => {
    parent.postMessage({ type: 'screenshotAttempt', payload: { show } }, '*');
  };

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Shift') isShiftPressed = true;
      if (e.key === 'Meta' || e.key === 'Control') isMetaPressed = true;

      // Detect Cmd/Ctrl + Shift combination (screenshot shortcut prefix)
      if (isShiftPressed && isMetaPressed) {
        notifyScreenshotAttempt(true);
      }

      // Also detect actual screenshot keys
      if (e.metaKey && e.shiftKey) {
        notifyScreenshotAttempt(true);
      }

      // Windows PrintScreen
      if (e.key === 'PrintScreen') {
        notifyScreenshotAttempt(true);
      }
    },
    true,
  );

  window.addEventListener(
    'keyup',
    (e) => {
      if (e.key === 'Shift') isShiftPressed = false;
      if (e.key === 'Meta' || e.key === 'Control') isMetaPressed = false;

      if (!isShiftPressed || !isMetaPressed) {
        notifyScreenshotAttempt(false);
      }
    },
    true,
  );

  window.addEventListener('blur', () => {
    notifyScreenshotAttempt(true);
  });

  window.addEventListener('focus', () => {
    isShiftPressed = false;
    isMetaPressed = false;
    notifyScreenshotAttempt(false);
  });

  window.addEventListener('message', function (event) {
    if (event.data.styles != null) {
      const styles = document.querySelector('#__livecodes_styles__');
      if (!styles) return;
      styles.innerHTML = event.data.styles;
    }
    if (event.data.flush) {
      document.body.innerHTML = '';
      document.head.innerHTML = '';
    } else {
      parent.postMessage({ type: 'loading', payload: false }, '*');
    }
  });

  window.addEventListener('load', () => {
    parent.postMessage({ type: 'loading', payload: false }, '*');
  });

  window.addEventListener('click', () => {
    parent.postMessage({ type: 'clicked' }, '*');
  });
})();
