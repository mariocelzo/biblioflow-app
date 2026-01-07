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
