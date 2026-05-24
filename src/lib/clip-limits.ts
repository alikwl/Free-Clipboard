export const FREE_CLIP_LIMIT = 500;

export function getClipLimitStatus(clipCount: number): {
  level: 'ok' | 'warning' | 'orange' | 'critical' | 'blocked';
  remaining: number;
  message: string;
  bannerColor: string;
  iconColor: string;
} {
  const remaining = FREE_CLIP_LIMIT - clipCount;

  if (remaining <= 0) {
    return {
      level: 'blocked',
      remaining: 0,
      message: `You've built an amazing collection of ${FREE_CLIP_LIMIT} clips! Upgrade to Pro to keep going — $5/mo`,
      bannerColor: 'border-rose-500/20 bg-rose-500/5 text-rose-300',
      iconColor: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
    };
  }

  if (remaining <= 10) {
    return {
      level: 'critical',
      remaining,
      message: `Only ${remaining} clip${remaining > 1 ? 's' : ''} left! You're almost at the limit.`,
      bannerColor: 'border-orange-500/20 bg-orange-500/5 text-orange-300',
      iconColor: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
    };
  }

  if (remaining <= 50) {
    return {
      level: 'warning',
      remaining,
      message: `${remaining} clips remaining — upgrade to Pro for unlimited clips.`,
      bannerColor: 'border-amber-500/20 bg-amber-500/5 text-amber-300',
      iconColor: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    };
  }

  return {
    level: 'ok',
    remaining,
    message: '',
    bannerColor: '',
    iconColor: '',
  };
}

export function isProUser(plan: string | null | undefined, trialEndsAt: string | null | undefined): boolean {
  if (plan === 'pro') return true;
  if (trialEndsAt && new Date(trialEndsAt) > new Date()) return true;
  return false;
}
