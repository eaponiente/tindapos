export const peso = (n) => '₱' + (Math.round((+n || 0) * 100) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDT = (ts) => new Date(ts).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export const roleRank = (r) => ({ cashier: 0, manager: 1, owner: 2 }[r] ?? 0);
