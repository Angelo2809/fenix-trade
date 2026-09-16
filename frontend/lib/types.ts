export type User = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "PARTNER";
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
};
export type Account = {
  id: string;
  account_number: string;
  original_name: string;
  nickname: string | null;
  initial_capital: string | null;
  start_date: string | null;
  is_new: boolean;
  is_active: boolean;
  status: "UNCONFIGURED" | "LOST" | "ACTIVE" | "INACTIVE";
  balance: string | null;
  risk_remaining: string | null;
  result: string;
  paid: string;
  return_pct: string | null;
  drawdown: string;
  drawdown_pct: string | null;
  lost_at: string | null;
  trade_count: number;
  pending_months: string[];
  first_seen_at: string;
  last_seen_at: string;
  first_trade_date: string | null;
};
export type Summary = {
  capital: string;
  balance: string;
  result: string;
  paid: string;
  return_pct: string | null;
  drawdown: string;
  drawdown_pct: string | null;
  account_count: number;
  unconfigured_count: number;
  last_update: string | null;
};
export type Dashboard = {
  summary: Summary;
  accounts: Account[];
  evolution: { date: string; result: string; balance: string; paid: string }[];
  monthly: {
    month: string;
    calculated: string;
    confirmed: string;
    paid: string;
  }[];
};
export type Batch = {
  id: string;
  filename: string;
  uploaded_at: string;
  status: "SUCCESS" | "FAILED" | "PROCESSING";
  rows_total: number;
  rows_imported: number;
  rows_duplicate: number;
  rows_rejected: number;
  error_message: string | null;
};
export type Close = {
  id?: string;
  month: string;
  calculated_result: string;
  confirmed_result: string;
  opening_balance: string;
  settled_profit: string;
  payout: string;
  desk_share: string;
  closing_balance: string;
  lost?: boolean;
  note?: string;
  closed_at?: string;
};
export const accountName = (a: Account) =>
  a.nickname || `Conta ${a.account_number}`;
