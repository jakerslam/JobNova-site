import Image from "next/image";

export function BrandLogo() {
  return (
    <Image
      src="/jobnova-wordmark.svg"
      alt="JobNova"
      width={195}
      height={41}
      className="h-[41.15px] w-[195px]"
      priority
      unoptimized
    />
  );
}
