type ChangePreferenceIconProps = {
  className?: string;
};

export function ChangePreferenceIcon({ className }: ChangePreferenceIconProps) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g clipPath="url(#change-preference-clip)">
        <path d="M0.666748 2.66667V6.66667H4.66675" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2.67333 9.99378C3.1056 11.2207 3.92489 12.2739 5.00777 12.9947C6.09065 13.7155 7.37846 14.0648 8.67714 13.9901C9.97583 13.9153 11.2151 13.4206 12.2081 12.5803C13.2011 11.74 13.8942 10.5998 14.1828 9.33136C14.4715 8.06295 14.3401 6.73509 13.8084 5.54785C13.2768 4.36061 12.3737 3.37831 11.2352 2.74896C10.0968 2.1196 8.7846 1.87729 7.49645 2.05853C6.2083 2.23976 5.01394 2.83473 4.09333 3.75378L1 6.66045" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <defs>
        <clipPath id="change-preference-clip">
          <rect width="16" height="16" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
