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

  // Read error parameter from URL redirect (e.g. callback errors)
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setErrorMsg(errorParam);
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (activeTab === 'password') {
        // Standard Email + Password auth
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;
        
        router.push('/dashboard');
        router.refresh();
      } else {
        // Magic Link passwordless auth
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
      console.error('Login error:', err);
      if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#07070a] text-foreground flex items-center justify-center p-4 overflow-hidden">
      {/* Decorative Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl pointer-events-none translate-x-1/2 translate-y-1/2" />

      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        {/* Brand Header */}
        <div className="flex flex-col items-center gap-2 mb-6 text-center">
          <div className="relative flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-600 shadow-xl shadow-indigo-500/20">
            <Clipboard className="w-6 h-6 text-white animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-neutral-200 to-neutral-400">
            FreeClipboard
          </h1>
          <p className="text-sm text-neutral-500 font-medium max-w-xs">
            Access your premium syncing workspace
          </p>
        </div>

        {/* Card Component */}
        <Card className="border border-white/5 bg-black/40 backdrop-blur-md shadow-2xl">
          <CardHeader className="space-y-1 border-b border-white/5 pb-4">
            <CardTitle className="text-lg font-bold text-neutral-200">Welcome Back</CardTitle>
            <CardDescription className="text-neutral-500 text-xs">
              Choose your preferred sign-in method
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {/* Tabs for Login Type */}
            <div className="grid grid-cols-2 p-1 bg-black/60 border border-white/5 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('password');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 text-xs font-bold rounded-lg transition-all duration-300 ${
                  activeTab === 'password'
                    ? 'bg-gradient-to-r from-indigo-500/10 to-violet-600/10 text-indigo-400 border border-indigo-500/20 shadow-inner'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                Password
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('magic-link');
                  setErrorMsg(null);
                  setSuccessMsg(null);
                }}
                className={`py-2 text-xs font-bold rounded-lg transition-all duration-300 ${
                  activeTab === 'magic-link'
                    ? 'bg-gradient-to-r from-indigo-500/10 to-violet-600/10 text-indigo-400 border border-indigo-500/20 shadow-inner'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                Magic Link
              </button>
            </div>

            {/* Error Notification */}
            {errorMsg && (
              <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5 text-rose-400 text-xs flex items-start gap-2.5 shadow-inner">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Success Notification */}
            {successMsg && (
              <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs flex items-start gap-2.5 shadow-inner">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {/* Email field */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                  Email Address
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

              {/* Password field - only for Password login */}
              {activeTab === 'password' && (
                <div className="space-y-1.5 animate-fade-in">
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
                      placeholder="••••••••"
                      className="bg-black/40 border-white/5 pl-10 text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-indigo-500/40 focus:ring-0 w-full h-10 rounded-xl"
                    />
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white border-0 shadow-lg shadow-indigo-500/10 font-bold text-xs h-10 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-300 mt-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {activeTab === 'password' ? 'Signing in...' : 'Sending link...'}
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
            <span>Don&apos;t have an account? </span>
            <Link href="/signup" className="text-indigo-400 font-bold ml-1 hover:underline flex items-center gap-0.5">
              Sign up <Sparkles className="w-3 h-3 text-indigo-400/80" />
            </Link>
          </CardFooter>
        </Card>

        {/* Global Back Link */}
        <div className="text-center mt-6">
          <Link href="/" className="text-xs text-neutral-600 hover:text-neutral-400 transition-colors">
            ← Back to Realtime Room Sync
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
