// Nav rail icons — simple 24px strokes matching the POS's rounded look.
// (The original stylesheet already reserved space for these; now they exist.)

const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export const SellIcon = () => (
  <svg {...base} aria-hidden>
    <circle cx="9" cy="20" r="1.4" />
    <circle cx="17" cy="20" r="1.4" />
    <path d="M3 3h2.2l2.4 12.4a1.5 1.5 0 0 0 1.47 1.2h7.9a1.5 1.5 0 0 0 1.46-1.14L20.5 8H6" />
  </svg>
);

export const HistoryIcon = () => (
  <svg {...base} aria-hidden>
    <path d="M4 4h16v17l-2.7-1.8L14.6 21l-2.6-1.8L9.4 21l-2.7-1.8L4 21V4Z" />
    <path d="M8 9h8M8 13h5" />
  </svg>
);

export const ItemsIcon = () => (
  <svg {...base} aria-hidden>
    <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" />
    <path d="M4 7l8 4 8-4M12 11v10" />
  </svg>
);

export const CategoriesIcon = () => (
  <svg {...base} aria-hidden>
    <rect x="4" y="4" width="7" height="7" rx="2" />
    <rect x="13" y="4" width="7" height="7" rx="2" />
    <rect x="4" y="13" width="7" height="7" rx="2" />
    <rect x="13" y="13" width="7" height="7" rx="2" />
  </svg>
);

export const StaffIcon = () => (
  <svg {...base} aria-hidden>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
    <circle cx="17" cy="9" r="2.4" />
    <path d="M15.8 14.4c2.6.2 4.3 1.9 4.7 4.6" />
  </svg>
);

export const BranchIcon = () => (
  <svg {...base} aria-hidden>
    <path d="M4 20V9l8-5 8 5v11" />
    <path d="M3 20h18" />
    <path d="M9 20v-5h6v5" />
    <path d="M9 10h.01M15 10h.01" />
  </svg>
);

export const LockIcon = () => (
  <svg {...base} aria-hidden>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
    <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
  </svg>
);
