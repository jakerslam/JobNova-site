type TopMatchedIconProps = {
  className?: string;
};

export function TopMatchedIcon({ className }: TopMatchedIconProps) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g clipPath="url(#top-matched-clip)">
        <path d="M6.28582 14.2857H1.71439C1.41129 14.2857 1.1206 14.1653 0.906268 13.951C0.691941 13.7367 0.571533 13.446 0.571533 13.1429V1.71428C0.571533 1.41118 0.691941 1.12049 0.906268 0.906162C1.1206 0.691834 1.41129 0.571426 1.71439 0.571426H14.2858C14.5889 0.571426 14.8796 0.691834 15.0939 0.906162C15.3083 1.12049 15.4287 1.41118 15.4287 1.71428V7.42857" stroke="#1F2937" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M0.571533 4H15.4287" stroke="#1F2937" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.8571 13.7143C12.4351 13.7143 13.7143 12.4351 13.7143 10.8571C13.7143 9.27919 12.4351 8 10.8571 8C9.27919 8 8 9.27919 8 10.8571C8 12.4351 9.27919 13.7143 10.8571 13.7143Z" stroke="#1F2937" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12.8801 12.88L15.4287 15.4286" stroke="#1F2937" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <defs>
        <clipPath id="top-matched-clip">
          <rect width="16" height="16" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
