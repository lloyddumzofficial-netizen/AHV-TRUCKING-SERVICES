"use client";

import { useEffect } from 'react';

/**
 * Standard modal behaviour: lock body scroll, close on Escape, and move focus
 * into the dialog on open.
 *
 * ProfileOnboarding implemented the scroll lock correctly and everything else
 * (the inquiry success modal, the admin delete confirm, the admin location
 * picker) had none of it — the page scrolled behind the overlay and Escape did
 * nothing.
 *
 * @param {boolean} isOpen
 * @param {object}  options
 * @param {() => void} [options.onClose]      Called on Escape. Omit for modals
 *                                            that must not be dismissible.
 * @param {import('react').RefObject<HTMLElement>} [options.containerRef]
 *                                            Focus moves here (or to its first
 *                                            focusable child) on open.
 */
export function useModalBehavior(isOpen, { onClose, containerRef } = {}) {
  // Body scroll lock.
  useEffect(() => {
    if (!isOpen) return undefined;

    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  // Escape to close.
  useEffect(() => {
    if (!isOpen || !onClose) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Move focus in, and restore it on close.
  useEffect(() => {
    if (!isOpen) return undefined;

    const previouslyFocused = document.activeElement;
    const container = containerRef?.current;

    if (container) {
      const focusable = container.querySelector(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (focusable || container).focus?.();
    }

    return () => {
      previouslyFocused?.focus?.();
    };
  }, [isOpen, containerRef]);
}

export default useModalBehavior;
