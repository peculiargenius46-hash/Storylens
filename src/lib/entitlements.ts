import type { SupabaseClient } from "@supabase/supabase-js";

// Plan limits are read from the `plans` table, never hard-coded here.
// See PRD section 28 — pricing and allowances must stay editable in Supabase
// without redeploying the application.

export type Allowance = {
  planCode: string;
  region: string;
  currency: string | null;
  limitMinutes: number | null;
  usedMinutes: number;
  remainingMinutes: number | null;
};

/** First day of the current calendar month, used as the billing period key. */
export function currentBillingPeriod() {
  const now = new Date();
  const period = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return period.toISOString().slice(0, 10);
}

export async function getAllowance(
  supabase: SupabaseClient,
  userId: string
): Promise<Allowance> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("pricing_region")
    .eq("id", userId)
    .maybeSingle();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan_code")
    .eq("user_id", userId)
    .maybeSingle();

  const region = profile?.pricing_region ?? "international";
  const planCode = subscription?.plan_code ?? "free";

  const { data: plan } = await supabase
    .from("plans")
    .select("currency, transcription_limit_minutes")
    .eq("region", region)
    .eq("plan_code", planCode)
    .maybeSingle();

  const { data: usage } = await supabase
    .from("usage")
    .select("transcription_seconds")
    .eq("user_id", userId)
    .eq("billing_period", currentBillingPeriod())
    .maybeSingle();

  const usedMinutes = Math.round((usage?.transcription_seconds ?? 0) / 60);
  const limitMinutes = plan?.transcription_limit_minutes ?? null;

  return {
    planCode,
    region,
    currency: plan?.currency ?? null,
    limitMinutes,
    usedMinutes,
    remainingMinutes:
      limitMinutes === null ? null : Math.max(limitMinutes - usedMinutes, 0),
  };
}

/** Adds transcribed seconds to this month's usage row, creating it if needed. */
export async function recordTranscriptionUsage(
  supabase: SupabaseClient,
  userId: string,
  seconds: number
) {
  const billingPeriod = currentBillingPeriod();

  const { data: existing } = await supabase
    .from("usage")
    .select("id, transcription_seconds")
    .eq("user_id", userId)
    .eq("billing_period", billingPeriod)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("usage")
      .update({
        transcription_seconds: (existing.transcription_seconds ?? 0) + seconds,
      })
      .eq("id", existing.id);
    return;
  }

  await supabase.from("usage").insert({
    user_id: userId,
    billing_period: billingPeriod,
    transcription_seconds: seconds,
  });
}
