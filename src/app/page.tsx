'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Brain,
  CheckCircle2,
  Clipboard,
  Grid3X3,
  LayoutPanelTop,
  Lock,
  ShieldCheck,
  Share2,
  Sparkles,
  Star,
  Table2,
  Wand2,
  Zap,
} from 'lucide-react';

const featureCards = [
  {
    title: 'Capture Everything',
    description: 'Save text, links, code snippets, research notes, and references in one organized clipboard workspace.',
    icon: Clipboard,
    tone: 'from-indigo-500/15 to-violet-500/10 border-indigo-200 text-indigo-600',
  },
  {
    title: 'Organize With Folders',
    description: 'Sort clips into colorful folders, keep important items pinned, and make large workspaces feel light.',
    icon: LayoutPanelTop,
    tone: 'from-emerald-500/15 to-teal-500/10 border-emerald-200 text-emerald-600',
  },
  {
    title: 'Instant Sharing',
    description: 'Turn clips and selected collections into shareable pages so your content moves fast across teams and devices.',
    icon: Share2,
    tone: 'from-amber-500/15 to-orange-500/10 border-amber-200 text-amber-600',
  },
  {
    title: 'AI Assistance',
    description: 'Summaries, rewrites, translation, and ClipMind help you turn raw clipboard clutter into useful knowledge.',
    icon: Sparkles,
    tone: 'from-fuchsia-500/15 to-pink-500/10 border-fuchsia-200 text-fuchsia-600',
  },
];

const views = [
  {
    name: 'Board View',
    icon: LayoutPanelTop,
    accent: 'border-indigo-200 bg-indigo-50',
    text: 'Sort clips by folders in a kanban-style canvas with compact cards and fast scanning.',
  },
  {
    name: 'Grid View',
    icon: Grid3X3,
    accent: 'border-violet-200 bg-violet-50',
    text: 'Balanced, visual cards with colorful tags, quick previews, and hover actions.',
  },
  {
    name: 'List View',
    icon: BarChart3,
    accent: 'border-emerald-200 bg-emerald-50',
    text: 'A denser layout for reviewing lots of clips quickly without losing readability.',
  },
  {
    name: 'Table View',
    icon: Table2,
    accent: 'border-amber-200 bg-amber-50',
    text: 'Structured rows for title, preview, tags, folder, date, and quick operations.',
  },
];

const requiredPages = [
  { name: 'Sign In', href: '/login', note: 'Fast login for returning users and synced workspaces.' },
  { name: 'Sign Up', href: '/signup', note: 'Onboarding for new users starting their clipboard hub.' },
  { name: 'Dashboard', href: '/dashboard', note: 'Main workspace with board, grid, list, and table views.' },
  { name: 'ClipMind AI', href: '/clipmind', note: 'Ask questions across saved clipboard knowledge.' },
  { name: 'Knowledge Graph', href: '/graph', note: 'Visualize themes, related snippets, and research clusters.' },
  { name: 'Analytics', href: '/analytics', note: 'See usage, activity, and workspace health at a glance.' },
  { name: 'Upgrade', href: '/upgrade', note: 'Pro plan, AI features, permanent sharing, and growth path.' },
];

const footerLinks = [
  { name: 'Dashboard', href: '/dashboard' },
  { name: 'Sign In', href: '/login' },
  { name: 'Sign Up', href: '/signup' },
  { name: 'Upgrade', href: '/upgrade' },
  { name: 'ClipMind', href: '/clipmind' },
  { name: 'Analytics', href: '/analytics' },
];

export default function Page() {
  return (
    <div className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_#ffffff,_#eef2ff_22%,_#f8fafc_52%,_#eef7ff_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-[-5rem] h-80 w-80 rounded-full bg-indigo-200/50 blur-3xl" />
        <div className="absolute right-[-6rem] top-28 h-72 w-72 rounded-full bg-fuchsia-200/35 blur-3xl" />
        <div className="absolute bottom-[-6rem] left-1/3 h-72 w-72 rounded-full bg-cyan-200/40 blur-3xl" />
      </div>

      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_14px_34px_rgba(99,102,241,0.28)]">
              <Clipboard className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">FreeClipboard</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Smart Clipboard Hub</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 lg:flex">
            <a href="#features" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">Features</a>
            <a href="#views" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">Views</a>
            <a href="#workflow" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">Workflow</a>
            <a href="#pages" className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">Pages</a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-4 py-2.5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(99,102,241,0.28)] transition hover:translate-y-[-1px]"
            >
              Start Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
            <div className="flex flex-col justify-center">
              <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-4 py-2 text-xs font-black uppercase tracking-[0.26em] text-indigo-600 shadow-sm">
                <Sparkles className="h-3.5 w-3.5" />
                Built for fast-moving minds
              </div>
              <h1 className="max-w-3xl text-4xl font-black leading-[0.95] tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                Turn your clipboard chaos into a clean, searchable command center.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                FreeClipboard helps you save, organize, summarize, translate, pin, and share the little pieces of work that usually get lost. It feels fast, colorful, and calm across desktop and mobile.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 px-6 py-3.5 text-sm font-black text-white shadow-[0_18px_40px_rgba(99,102,241,0.28)] transition hover:translate-y-[-1px]"
                >
                  Create Workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                >
                  Sign In to Dashboard
                </Link>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl border border-slate-200 bg-white/85 p-4 shadow-[0_14px_34px_rgba(148,163,184,0.14)]">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Views</p>
                  <p className="mt-2 text-3xl font-black text-slate-950">4</p>
                  <p className="mt-1 text-sm text-slate-600">Board, grid, list, and table modes.</p>
                </div>
                <div className="rounded-3xl border border-emerald-200 bg-emerald-50/90 p-4 shadow-[0_14px_34px_rgba(16,185,129,0.12)]">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700">AI Layer</p>
                  <p className="mt-2 text-3xl font-black text-slate-950">Smart</p>
                  <p className="mt-1 text-sm text-slate-700">Summary, rewrite, translate, and ClipMind.</p>
                </div>
                <div className="rounded-3xl border border-amber-200 bg-amber-50/90 p-4 shadow-[0_14px_34px_rgba(245,158,11,0.12)]">
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-700">Sharing</p>
                  <p className="mt-2 text-3xl font-black text-slate-950">Live</p>
                  <p className="mt-1 text-sm text-slate-700">Links, collections, and cross-device flow.</p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="rounded-[32px] border border-slate-200 bg-white/88 p-4 shadow-[0_24px_70px_rgba(148,163,184,0.18)] backdrop-blur-xl sm:p-5">
                <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-5 text-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.28em] text-indigo-200/80">Workspace Preview</p>
                      <h2 className="mt-2 text-2xl font-black">All Synced Clips</h2>
                      <p className="mt-2 max-w-sm text-sm leading-6 text-indigo-100/85">
                        Save important snippets, collect references, and let AI make your clipboard useful instead of noisy.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-right">
                      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-indigo-100/70">Sync Status</p>
                      <p className="mt-1 text-sm font-bold text-emerald-300">All devices connected</p>
                    </div>
                  </div>

                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-3xl border border-white/12 bg-white/10 p-4 backdrop-blur-md">
                      <div className="flex items-center justify-between">
                        <span className="rounded-full border border-violet-300/30 bg-violet-300/12 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-violet-100">Grid View</span>
                        <Grid3X3 className="h-4 w-4 text-violet-200" />
                      </div>
                      <div className="mt-4 rounded-2xl border border-white/10 bg-white/10 p-4">
                        <p className="text-sm font-bold">Campaign notes & snippets</p>
                        <p className="mt-2 text-xs leading-6 text-indigo-100/75">
                          Product notes, URLs, code ideas, and references with quick actions.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="rounded-full border border-cyan-300/30 bg-cyan-300/12 px-2 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100">Research</span>
                          <span className="rounded-full border border-fuchsia-300/30 bg-fuchsia-300/12 px-2 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-100">Clipboard</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-3xl border border-emerald-300/25 bg-emerald-300/12 p-4">
                        <div className="flex items-center gap-2 text-emerald-200">
                          <Sparkles className="h-4 w-4" />
                          <span className="text-[10px] font-black uppercase tracking-[0.24em]">AI Summary</span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-white/90">
                          Condenses saved content into one clean takeaway so you can scan faster.
                        </p>
                      </div>
                      <div className="rounded-3xl border border-amber-300/25 bg-amber-300/12 p-4">
                        <div className="flex items-center gap-2 text-amber-100">
                          <Share2 className="h-4 w-4" />
                          <span className="text-[10px] font-black uppercase tracking-[0.24em]">Shareable Links</span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-white/90">
                          Share a single clip or selected collection with one clean public page.
                        </p>
                      </div>
                      <div className="rounded-3xl border border-white/12 bg-white/10 p-4">
                        <div className="flex items-center gap-2 text-indigo-100">
                          <Brain className="h-4 w-4" />
                          <span className="text-[10px] font-black uppercase tracking-[0.24em]">ClipMind</span>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-white/90">
                          Ask questions across your saved workspace like a searchable second brain.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-2xl">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-indigo-600">Why It Feels Better</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Built for real work, not just storage.
            </h2>
            <p className="mt-4 text-base leading-8 text-slate-600">
              Every section is designed to reduce friction: faster capture, cleaner browsing, smoother sharing, and better thinking around saved content.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {featureCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.title}
                  className={`group rounded-[28px] border bg-gradient-to-br p-5 shadow-[0_18px_45px_rgba(148,163,184,0.14)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_22px_55px_rgba(99,102,241,0.18)] ${card.tone}`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-current/15 bg-white/70">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 text-xl font-black tracking-tight text-slate-950">{card.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-700">{card.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section id="views" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="rounded-[34px] border border-slate-200 bg-white/86 p-6 shadow-[0_24px_70px_rgba(148,163,184,0.16)] backdrop-blur-xl sm:p-8">
            <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-violet-600">Flexible Workspace</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                  Four views for four different ways of thinking.
                </h2>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm font-semibold text-slate-600">
                Switch between scanning, sorting, planning, and structured review.
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {views.map((view) => {
                const Icon = view.icon;
                return (
                  <div key={view.name} className={`rounded-[28px] border p-5 transition hover:-translate-y-1 hover:shadow-[0_18px_45px_rgba(148,163,184,0.18)] ${view.accent}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white/80">
                        <Icon className="h-5 w-5 text-slate-700" />
                      </div>
                      <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Live</span>
                    </div>
                    <h3 className="mt-5 text-xl font-black text-slate-950">{view.name}</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-700">{view.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="workflow" className="mx-auto grid max-w-7xl gap-6 px-4 py-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div className="rounded-[32px] border border-slate-200 bg-white/86 p-6 shadow-[0_24px_70px_rgba(148,163,184,0.16)]">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-600">Workflow</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">From copy to clarity in a few taps.</h2>
            <div className="mt-6 space-y-5">
              {[
                'Save a clip from your browser, desktop, notes, or extension.',
                'Drop it into a folder, pin it, tag it, or keep it in the general queue.',
                'Use AI summary, rewrite, translation, or ClipMind to make it useful.',
                'Share one item or a curated page with a clean public link.',
              ].map((step, index) => (
                <div key={step} className="flex gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-indigo-50 text-sm font-black text-indigo-600">
                    {index + 1}
                  </div>
                  <p className="pt-1 text-sm leading-7 text-slate-700">{step}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="rounded-[30px] border border-slate-200 bg-white/86 p-5 shadow-[0_18px_45px_rgba(148,163,184,0.14)]">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-fuchsia-200 bg-fuchsia-50 text-fuchsia-600">
                  <Wand2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-fuchsia-600">AI Assist</p>
                  <h3 className="text-lg font-black text-slate-950">Summaries that feel useful</h3>
                </div>
              </div>
              <div className="mt-5 rounded-3xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-teal-50 to-white p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">AI Summary</p>
                <p className="mt-3 text-sm leading-7 text-slate-700">
                  “This clip explains how to publish a compliant Chrome extension by covering policy pages, assets, manifest review, and submission requirements.”
                </p>
              </div>
            </div>

            <div className="rounded-[30px] border border-slate-200 bg-white/86 p-5 shadow-[0_18px_45px_rgba(148,163,184,0.14)]">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-600">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-600">Share Flow</p>
                  <h3 className="text-lg font-black text-slate-950">Public pages, private control</h3>
                </div>
              </div>
              <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50/85 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">Shareable Link</p>
                <p className="mt-3 break-all text-sm leading-7 text-slate-700">
                  freeclipboard.com/s/secure-share-token
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <div className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-emerald-700">
                    Active
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
                    Revocable
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="pages" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-2xl">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-cyan-600">Required Pages</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Core pages this product should always make obvious.
            </h2>
            <p className="mt-4 text-base leading-8 text-slate-600">
              Users should instantly understand where to sign in, where to work, where AI lives, and where advanced features like analytics or upgrade paths belong.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {requiredPages.map((page) => (
              <Link
                key={page.name}
                href={page.href}
                className="group rounded-[26px] border border-slate-200 bg-white/86 p-5 shadow-[0_14px_34px_rgba(148,163,184,0.12)] transition hover:-translate-y-1 hover:border-indigo-200 hover:shadow-[0_20px_44px_rgba(99,102,241,0.14)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-950">{page.name}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{page.note}</p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-indigo-500" />
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="rounded-[36px] border border-slate-200 bg-gradient-to-r from-slate-950 via-indigo-950 to-violet-900 px-6 py-10 text-white shadow-[0_24px_70px_rgba(15,23,42,0.28)] sm:px-8 lg:px-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-indigo-200/80">Ready To Use</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                  Start with a free account, then grow into a real clipboard operating system.
                </h2>
                <p className="mt-4 text-base leading-8 text-indigo-100/80">
                  Use sign in for returning users, sign up for new workspaces, and upgrade when your flow needs AI depth, unlimited history, and permanent sharing.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-black text-slate-950 transition hover:bg-slate-100"
                >
                  Create Account
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/15"
                >
                  Sign In
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-16 border-t border-slate-200/80 bg-white/70">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-[0_14px_34px_rgba(99,102,241,0.28)]">
                <Clipboard className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-900">FreeClipboard</p>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Organized by default</p>
              </div>
            </div>
            <p className="mt-5 max-w-xl text-sm leading-7 text-slate-600">
              A colorful clipboard workspace for saving important fragments, making them searchable, and moving them smoothly between devices and collaborators.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Product</p>
              <div className="mt-4 flex flex-col gap-3">
                {footerLinks.slice(0, 3).map((link) => (
                  <Link key={link.name} href={link.href} className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">
                    {link.name}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Explore</p>
              <div className="mt-4 flex flex-col gap-3">
                {footerLinks.slice(3).map((link) => (
                  <Link key={link.name} href={link.href} className="text-sm font-semibold text-slate-600 transition hover:text-slate-950">
                    {link.name}
                  </Link>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Trust</p>
              <div className="mt-4 flex flex-col gap-3">
                <span className="text-sm font-semibold text-slate-600">Privacy</span>
                <span className="text-sm font-semibold text-slate-600">Terms</span>
                <span className="text-sm font-semibold text-slate-600">Support</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
