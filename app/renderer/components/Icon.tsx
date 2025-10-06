import React from 'react';

type IconName =
  | 'info'
  | 'success'
  | 'warning'
  | 'error'
  | 'upload'
  | 'file'
  | 'clock';

interface IconProps {
  name: IconName;
  size?: number;
  stroke?: number;
  className?: string;
}

const paths: Record<IconName, React.ReactNode> = {
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01" />
      <path d="M10.5 12h3v4" />
    </>
  ),
  success: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5l2.5 2.5 4.5-5" />
    </>
  ),
  warning: (
    <>
      <path d="M12 4l8 14H4l8-14z" />
      <path d="M12 10v4" />
      <path d="M12 16h.01" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V8" />
      <path d="M8.5 11.5L12 8l3.5 3.5" />
      <rect x="5" y="16" width="14" height="3" rx="1.5" />
    </>
  ),
  file: (
    <>
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M14 3v5h5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </>
  )
};

export const Icon: React.FC<IconProps> = ({ name, size = 20, stroke = 1.8, className }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    {paths[name]}
  </svg>
);

export default Icon;

