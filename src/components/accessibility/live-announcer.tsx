"use client";

import { useEffect, useState } from "react";

interface LiveAnnouncerProps {
  message: string;
  politeness?: "polite" | "assertive";
  clearDelay?: number;
}

export function LiveAnnouncer({ message, politeness = "polite", clearDelay = 3000 }: LiveAnnouncerProps) {
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (message) {
      // Mirror voluto del prop `message` nello stato locale: la live region deve
      // annunciare il messaggio agli screen reader e poi svuotarsi dopo
      // `clearDelay`. La regola segnala solo un possibile render aggiuntivo, qui
      // accettabile e necessario per il comportamento di annuncio/pulizia.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnnouncement(message);
      const timer = setTimeout(() => setAnnouncement(""), clearDelay);
      return () => clearTimeout(timer);
    }
  }, [message, clearDelay]);

  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {announcement}
    </div>
  );
}

// Hook per usare l'announcer
export function useAnnouncer() {
  const [message, setMessage] = useState("");
  const [politeness, setPoliteness] = useState<"polite" | "assertive">("polite");

  const announce = (text: string, level: "polite" | "assertive" = "polite") => {
    setMessage(text);
    setPoliteness(level);
    setTimeout(() => setMessage(""), 100);
  };

  return {
    announce,
    LiveAnnouncerComponent: () => (
      <LiveAnnouncer message={message} politeness={politeness} />
    ),
  };
}
