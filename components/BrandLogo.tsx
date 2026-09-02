import Image from "next/image";

export function BrandLogo() {
  return (
    <div className="flex items-center gap-2">
      <Image
        src="/jobnova-icon.png"
        alt=""
        width={31}
        height={31}
        className="h-[31px] w-[31px] rounded-[7px]"
        priority
      />
      <span className="text-[21px] font-semibold tracking-[-0.02em] text-ink">JobNova</span>
    </div>
  );
}
