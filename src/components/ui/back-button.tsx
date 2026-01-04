"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "./button";

interface BackButtonProps {
  href?: string;
  label?: string;
  className?: string;
}

export function BackButton({ 
  href, 
  label = "Indietro",
  className = "" 
}: BackButtonProps) {
  const router = useRouter();

  const handleBack = () => {
    if (href) {
      router.push(href);
    } else {
      router.back();
    }
  };

  return (
    <Button
      variant="ghost"
      onClick={handleBack}
      className={`
        group flex items-center gap-2 px-0 
        text-[#007AFF] hover:text-[#0051D5] 
        hover:bg-transparent
        transition-all duration-200
        ${className}
      `}
    >
      <ArrowLeft 
        className="h-5 w-5 transition-transform group-hover:-translate-x-1" 
      />
      <span className="font-medium text-base">{label}</span>
    </Button>
  );
}
