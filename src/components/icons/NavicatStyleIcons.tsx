interface IconProps {
  size?: number;
  className?: string;
}

interface DatabaseIconProps extends IconProps {
  active?: boolean;
}

export const NavicatConnectionIcon = ({ size = 16, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={className}
  >
    <defs>
      <linearGradient id="navicat-connection-bg" x1="4" y1="3" x2="20" y2="21">
        <stop offset="0" stopColor="#7ee66c" />
        <stop offset="1" stopColor="#24b94d" />
      </linearGradient>
    </defs>
    <rect x="2.5" y="2.5" width="19" height="19" rx="3.2" fill="url(#navicat-connection-bg)" />
    <path
      d="M7.2 6.1c3.8.7 7.1 2.8 9.3 5.8 1.2 1.6 1.7 3.4 1.5 5.5-3.7-.6-7.2-2.5-9.5-5.4-1.4-1.7-1.9-3.7-1.3-5.9Z"
      fill="#fff"
      opacity=".96"
    />
    <path
      d="M8.1 7.1c2.3 2.2 4.5 4.5 7.5 8.5"
      fill="none"
      stroke="#2ebf54"
      strokeWidth="1.35"
      strokeLinecap="round"
      opacity=".75"
    />
    <circle cx="18" cy="18" r="3.2" fill="#3ed64f" stroke="#fff" strokeWidth="1.1" />
    <path d="M18 16.5v3M16.5 18h3" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

export const NavicatDatabaseIcon = ({
  size = 16,
  className,
  active = false,
}: DatabaseIconProps) => {
  const top = active ? "#64d878" : "#c7d0d5";
  const mid = active ? "#36bd55" : "#8e9aa0";
  const low = active ? "#238a46" : "#68747a";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
    >
      <ellipse cx="12" cy="5.5" rx="7.8" ry="3.4" fill={top} />
      <path d="M4.2 5.5v5.3c0 1.9 3.5 3.4 7.8 3.4s7.8-1.5 7.8-3.4V5.5" fill={mid} />
      <ellipse cx="12" cy="10.8" rx="7.8" ry="3.4" fill={mid} />
      <path d="M4.2 10.8v5.4c0 1.9 3.5 3.4 7.8 3.4s7.8-1.5 7.8-3.4v-5.4" fill={low} />
      <ellipse cx="12" cy="16.2" rx="7.8" ry="3.4" fill={active ? "#31a653" : "#7d8a90"} />
      <path d="M5.2 5.3c1.2 1.1 3.8 1.9 6.8 1.9s5.6-.8 6.8-1.9" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="1.2" />
      <path d="M5 10.7c1.3 1.1 3.9 1.8 7 1.8s5.7-.7 7-1.8" fill="none" stroke="#fff" strokeOpacity=".3" strokeWidth="1.1" />
    </svg>
  );
};

export const NavicatTableIcon = ({ size = 16, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={className}
  >
    <defs>
      <linearGradient id="navicat-table-body" x1="4" y1="3" x2="20" y2="21">
        <stop offset="0" stopColor="#bfe6ff" />
        <stop offset="1" stopColor="#58aef2" />
      </linearGradient>
    </defs>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2.3" fill="url(#navicat-table-body)" />
    <path d="M3.5 6.2c0-1.5 1.2-2.7 2.7-2.7h11.6c1.5 0 2.7 1.2 2.7 2.7v3H3.5v-3Z" fill="#2f8bea" />
    <path d="M8.9 9.2v11.3M14.9 9.2v11.3M3.8 14.1h16.4" stroke="#eaf7ff" strokeOpacity=".72" strokeWidth="1.05" />
    <path d="M5 5.6h14" stroke="#d9f2ff" strokeOpacity=".45" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

export const NavicatSchemaIcon = ({ size = 16, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={className}
  >
    <rect x="4" y="4" width="7" height="7" rx="1.5" fill="#79c7ff" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" fill="#4aa3ef" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" fill="#4aa3ef" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" fill="#79c7ff" />
  </svg>
);
