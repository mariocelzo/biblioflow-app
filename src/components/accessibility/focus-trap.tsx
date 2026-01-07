"use client";

import { useEffect, useRef, useCallback } from "react";

interface FocusTrapProps {
  children: React.ReactNode;
  active?: boolean;
  initialFocus?: React.RefObject<HTMLElement>;
  returnFocusOnDeactivate?: boolean;
}

/**
 * FocusTrap - Componente per intrappolare il focus all'interno di un container
 * Usato principalmente per modali e dialog per accessibilità
 */
export function FocusTrap({
  children,
  active = true,
  initialFocus,
  returnFocusOnDeactivate = true,
}: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Trova tutti gli elementi focusabili
  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];
    
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable]',
    ].join(', ');

    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(focusableSelectors)
    ).filter((el) => {
      // Filtra elementi nascosti
      return el.offsetParent !== null && !el.hasAttribute('hidden');
    });
  }, []);

  // Gestisce Tab e Shift+Tab
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!active || event.key !== "Tab") return;

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      // Shift + Tab: vai all'ultimo se sei sul primo
      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: vai al primo se sei sull'ultimo
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    },
    [active, getFocusableElements]
  );

  // Setup focus trap
  useEffect(() => {
    if (!active) return;

    // Salva elemento attivo corrente
    previousActiveElement.current = document.activeElement as HTMLElement;

    // Focus iniziale
    const focusableElements = getFocusableElements();
    if (initialFocus?.current) {
      initialFocus.current.focus();
    } else if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    // Event listener
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      
      // Restituisci focus all'elemento precedente
      if (returnFocusOnDeactivate && previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    };
  }, [active, getFocusableElements, handleKeyDown, initialFocus, returnFocusOnDeactivate]);

  // Previeni focus fuori dal container
  useEffect(() => {
    if (!active) return;

    const handleFocusIn = (event: FocusEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        const focusableElements = getFocusableElements();
        if (focusableElements.length > 0) {
          focusableElements[0].focus();
        }
      }
    };

    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, [active, getFocusableElements]);

  return (
    <div ref={containerRef} data-focus-trap={active ? "active" : "inactive"}>
      {children}
    </div>
  );
}

/**
 * Hook per usare focus trap programmaticamente
 */
export function useFocusTrap(active: boolean = true) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];
    
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');

    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(focusableSelectors)
    ).filter((el) => el.offsetParent !== null);
  }, []);

  const activate = useCallback(() => {
    previousActiveElement.current = document.activeElement as HTMLElement;
    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }
  }, [getFocusableElements]);

  const deactivate = useCallback(() => {
    if (previousActiveElement.current) {
      previousActiveElement.current.focus();
    }
  }, []);

  useEffect(() => {
    if (active) {
      activate();
    }
    return () => {
      if (active) {
        deactivate();
      }
    };
  }, [active, activate, deactivate]);

  return { containerRef, activate, deactivate };
}
