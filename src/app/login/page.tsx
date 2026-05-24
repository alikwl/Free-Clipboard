'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Clipboard, Mail, KeyRound, Loader2, Sparkles, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<'password' | 'magic-link'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setErrorMsg(errorParam);
    }
  }, [searchParams]);

  const broadcastAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      try { window.postMessage({ type: 'FC_AUTH', token: session.access_token }, '*'); } catch { /* noop */ }
      try { window.opener?.postMessage({ type: 'FC_AUTH', token: session.access_token }, '*'); } catch { /* noop */ }
      try { window.postMessage({ type: 'FC_AUTH', token: session.access_token }, window.location.origin); } catch { /* noop */ }
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (activeTab === 'password') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        await broadcastAuthToken();
        // Small delay so content script can relay to background before navigation
        await new Promise(r => setTimeout(r, 200));
        router.push('/dashboard');
        router.refresh();
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) throw error;
        setSuccessMsg('Magic link sent! Check your email inbox to sign in.');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('An unexpected error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      setGoogleLoading(false);
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('Google sign-in failed.');
      }
    }
  };

  return (
    <div className="relative min-h-screen bg-[#07070a] text-foreground flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none translate-x-1/2 translate-y-1/2" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Brand */}
        <div className="flex flex-col items-center gap-2 mb-8 text-center">
          <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-600 shadow-xl shadow-indigo-500/20">
            <Clipboard className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-neutral-200 to-neutral-400">
            FreeClipboard
          </h1>
          <p className="text-sm text-neutral-500 font-medium">
            Sign in to access your workspace
          </p>
        </div>

        <Card className="border border-white/5 bg-black/40 backdrop-blur-md shadow-2xl">
          <CardHeader className="space-y-1 border-b border-white/5 pb-5">
            <CardTitle className="text-lg font-bold text-neutral-200">Welcome back</CardTitle>
            <CardDescription className="text-neutral-500 text-xs">
              Choose your preferred sign-in method
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {/* Google OAuth */}
            <Button
              type="button"
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              className="w-full bg-white hover:bg-neutral-100 text-neutral-800 border-0 font-semibold text-xs h-11 rounded-xl flex items-center justify-center gap-2.5 transition-all"
            >
              {googleLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              )}
              Continue with Google
            </Button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/5" />
              <span className="text-[10px] font-bold text-neutral-600 uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-white/5" />
            </div>

            {/* Tabs */}
            <div className="grid grid-cols-2 p-1 bg-black/60 border border-white/5 rounded-xl">
              <button
                type="button"
                onClick={() => { setActiveTab('password'); setErrorMsg(null); setSuccessMsg(null); }}
                className={`py-2 text-xs font-bold rounded-lg transition-all duration-300 ${
                  activeTab === 'password'
                    ? 'bg-gradient-to-r from-indigo-500/10 to-violet-600/10 text-indigo-400 border border-indigo-500/20 shadow-inner'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                <KeyRound className="w-3 h-3 inline mr-1.5 mb-0.5" />
                Password
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('magic-link'); setErrorMsg(null); setSuccessMsg(null); }}
                className={`py-2 text-xs font-bold rounded-lg transition-all duration-300 ${
                  activeTab === 'magic-link'
                    ? 'bg-gradient-to-r from-indigo-500/10 to-violet-600/10 text-indigo-400 border border-indigo-500/20 shadow-inner'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                <Mail className="w-3 h-3 inline mr-1.5 mb-0.5" />
                Magic Link
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5 text-rose-400 text-xs flex items-start gap-2.5 shadow-inner">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs flex items-start gap-2.5 shadow-inner">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-3 w-4 h-4 text-neutral-600" />
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="bg-black/40 border-white/5 pl-10 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-indigo-500/40 focus:ring-0 w-full h-10 rounded-xl"
                  />
                </div>
              </div>

              {activeTab === 'password' && (
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                      Password
                    </label>
                  </div>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-3 w-4 h-4 text-neutral-600" />
                    <Input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                      className="bg-black/40 border-white/5 pl-10 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-indigo-500/40 focus:ring-0 w-full h-10 rounded-xl"
                    />
                  </div>
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white border-0 shadow-lg shadow-indigo-500/10 font-bold text-xs h-10 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-300 mt-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {activeTab === 'password' ? 'Signing in&hellip;' : 'Sending link&hellip;'}
                  </>
                ) : (
                  <>
                    {activeTab === 'password' ? 'Sign In' : 'Send Magic Link'}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="border-t border-white/5 pt-4 pb-4 flex justify-center text-xs text-neutral-500">
            <span>Don&apos;t have an account?</span>
            <Link href="/signup" className="text-indigo-400 font-bold ml-1 hover:underline flex items-center gap-0.5">
              Create one <Sparkles className="w-3 h-3 text-indigo-400/80" />
            </Link>
          </CardFooter>
        </Card>

        <div className="text-center mt-6">
          <Link href="/" className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors">
            &larr; Back to Realtime Room Sync
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#07070a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
