import { createClient } from "@/utils/supabase/server"

const DAILY_LIMITS: Record<string, number> = {
  free: 5,
  pro: 100,
}

export async function checkRateLimit(
  userId: string,
  plan: string,
  action: string,
  trialEndsAt?: string | null
): Promise<{ allowed: boolean; remaining: number; error?: string }> {
<<<<<<< HEAD
  const supabase = createClient()
=======
  const supabase = await createClient()
>>>>>>> 7a2e13a (Initial commit from PC)

  // Trial users get pro limits
  const isTrial = trialEndsAt && new Date(trialEndsAt) > new Date();
  const effectivePlan = (plan === 'pro' || isTrial) ? 'pro' : 'free';
  const limit = DAILY_LIMITS[effectivePlan] ?? DAILY_LIMITS.free

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const { count, error } = await supabase
    .from("ai_usage")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gt("created_at", today.toISOString())

  if (error) {
    console.error("Error checking AI usage:", error)
    return { allowed: true, remaining: limit }
  }

  const usageCount = count ?? 0

  if (usageCount >= limit) {
    return {
      allowed: false,
      remaining: 0,
      error: `Daily AI usage limit reached (${usageCount}/${limit}). Try again tomorrow.`,
    }
  }

  const { error: insertError } = await supabase.from("ai_usage").insert({
    user_id: userId,
    action,
  })

  if (insertError) {
    console.error("Error logging AI usage:", insertError)
  }

  return {
    allowed: true,
    remaining: limit - usageCount - 1,
  }
}
