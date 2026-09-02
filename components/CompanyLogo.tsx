"use client";

/* eslint-disable @next/next/no-img-element */

import { BriefcaseBusiness } from "lucide-react";
import { useState } from "react";

type CompanyLogoProps = {
  company: string;
  logoUrl?: string;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
};

export function CompanyLogo({
  company,
  logoUrl,
  className = "h-[72px] w-[72px]",
  imageClassName = "h-[60px] w-[60px]",
  fallbackClassName = "h-9 w-9",
}: CompanyLogoProps) {
  const [hasImageError, setHasImageError] = useState(false);
  const shouldShowImage = Boolean(logoUrl) && !hasImageError;

  return (
    <div className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-white ${className}`}>
      {shouldShowImage ? (
        <img
          src={logoUrl}
          alt={`${company} logo`}
          className={`object-contain ${imageClassName}`}
          referrerPolicy="no-referrer"
          onError={() => setHasImageError(true)}
        />
      ) : (
        <div className="grid h-full w-full place-items-center rounded-full bg-zinc-100 text-ink">
          <BriefcaseBusiness aria-hidden="true" className={fallbackClassName} />
        </div>
      )}
    </div>
  );
}
