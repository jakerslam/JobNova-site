type MatchRingProps = {
  match: number;
  className?: string;
  sizeClassName?: string;
  paddingClassName?: string;
};

export function MatchRing({
  match,
  className = "",
  sizeClassName = "h-[82px] w-[82px]",
  paddingClassName = "p-[6px]",
}: MatchRingProps) {
  const ringColor = match >= 90 ? "#9bea1f" : "#ffcf2f";
  const matchAngle = match * 3.6;

  return (
    <div
      aria-label={`${match}% match`}
      className={`grid shrink-0 place-items-center rounded-full text-center ${sizeClassName} ${paddingClassName} ${className}`}
      style={{
        background: `conic-gradient(from ${360 - matchAngle}deg, ${ringColor} 0deg ${matchAngle}deg, #eef0f2 ${matchAngle}deg 360deg)`,
      }}
    >
      <div className="grid h-full w-full place-items-center rounded-full bg-white">
        <div className="translate-y-[1px] text-center">
          <strong className="block text-[21px] font-medium leading-none text-ink">{match}%</strong>
          <span className="mt-1 block text-[12px] font-normal leading-none text-ink">Match</span>
        </div>
      </div>
    </div>
  );
}
