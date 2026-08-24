export interface Env {
  DB: D1Database;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_REDIRECT_URI: string;
  ACCOUNT_DELETION_GRACE_SECONDS?: string;
}

export interface Principal {
  userId: string;
  participantId: string;
  displayName: string;
  accountState: "active" | "deletion_pending";
  deletionDueAt: string | null;
}
