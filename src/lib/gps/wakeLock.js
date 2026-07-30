// Keeping the driver's screen on for the length of a trip.
//
// Two mechanisms: the native Wake Lock API, and a silent looping video for
// browsers without it (notably older iOS Safari). Both are wrapped here so the
// caller gets one honest boolean instead of the previous behaviour, which
// reported "Screen kept awake" whether or not anything actually held the screen.

let noSleepVideo = null;

// A 1x1 silent MP4. Playing a video is the only way to defeat screen sleep on
// browsers with no Wake Lock API.
const SILENT_VIDEO_SRC =
  'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAsxtZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE0OCByMjYwMSBhMGNkN2QzIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAxNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiBkZXNxdWFudHBlbmFsdHk9MTMgbmFsLWhyZD1ub25lIGNvbG9yc3BhY2U9dW5zcGVjaWZpZWQgYml0ZGVwdGg9OCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiByZW9yZGVyPTEgZHVwbGljYXRlX21lcmdlPTEgbm8tc3R5bGVzPTAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAOaGdgAAAABkUAAAAMaWV0ZgAAAA==';

/**
 * Start the silent-video fallback. Returns true only if playback actually began.
 *
 * The previous implementation used setAttribute('muted', '') after creation,
 * which does not reliably set the muted *property* — autoplay was then blocked,
 * play() rejected, and the rejection was swallowed.
 */
export async function enableNoSleep() {
  if (typeof window === 'undefined') return false;

  if (!noSleepVideo) {
    noSleepVideo = document.createElement('video');
    noSleepVideo.loop = true;
    noSleepVideo.muted = true;
    noSleepVideo.defaultMuted = true;
    noSleepVideo.playsInline = true;
    noSleepVideo.setAttribute('muted', '');
    noSleepVideo.setAttribute('playsinline', '');
    noSleepVideo.setAttribute('aria-hidden', 'true');
    noSleepVideo.src = SILENT_VIDEO_SRC;
    noSleepVideo.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;pointer-events:none;';
    document.body.appendChild(noSleepVideo);
  }

  try {
    await noSleepVideo.play();
    return !noSleepVideo.paused;
  } catch {
    return false;
  }
}

export function disableNoSleep() {
  if (!noSleepVideo) return;
  noSleepVideo.pause();
  noSleepVideo.remove();
  noSleepVideo = null;
}

/**
 * Acquire a screen wake lock, falling back to the video trick.
 *
 * Releases any sentinel it already holds first: requesting without releasing (as
 * happened on every visibilitychange) leaks sentinels.
 *
 * @returns {Promise<{ held: boolean, sentinel: object|null, kind: 'native'|'video'|'none' }>}
 */
export async function acquireWakeLock(previousSentinel, onRelease) {
  await releaseSentinel(previousSentinel);

  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      if (typeof onRelease === 'function') {
        sentinel.addEventListener('release', onRelease);
      }
      return { held: true, sentinel, kind: 'native' };
    } catch {
      // Denied or unavailable (often because the document is hidden). Fall back.
    }
  }

  const videoHeld = await enableNoSleep();
  return { held: videoHeld, sentinel: null, kind: videoHeld ? 'video' : 'none' };
}

export async function releaseSentinel(sentinel) {
  if (!sentinel) return;
  try {
    await sentinel.release();
  } catch {
    // Already released.
  }
}

export async function releaseWakeLock(sentinel) {
  disableNoSleep();
  await releaseSentinel(sentinel);
}
