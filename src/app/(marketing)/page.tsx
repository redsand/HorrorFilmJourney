import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button, Card } from '@/components/ui';
import { readSessionFromRequest } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';

async function resolveSessionUserId(): Promise<string | null> {
  const cookie = headers().get('cookie');
  const request = new Request('http://localhost', {
    headers: cookie ? { cookie } : {},
  });
  const session = readSessionFromRequest(request);
  if (!session?.userId) {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true },
  });
  return user?.id ?? null;
}

export default async function LandingPage() {
  const userId = await resolveSessionUserId();
  if (userId) {
    redirect('/journey');
  }

  return (
    <div className="min-h-dvh">
      {/* Fixed full-page background */}
      <div className="fixed inset-0 -z-10">
        <Image
          src="/landing-background.png"
          alt=""
          fill
          priority
          className="object-cover object-center"
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-0 bg-[rgba(5,5,8,0.72)]" />
      </div>

      {/* Centered content column (~50% width on desktop) */}
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-16 pt-6">

        {/* Hero */}
        <section className="relative overflow-hidden rounded-2xl border border-[rgba(193,18,31,0.5)] bg-[rgba(8,8,10,0.96)] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.65)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_30%,rgba(155,17,30,0.28),transparent_58%)]" />
          <div className="relative">
            <div className="flex justify-center">
              <Image
                src="/cinemacodex_cropped_optimized.png"
                alt="CinemaCodex"
                width={480}
                height={270}
                priority
                className="w-full max-w-sm sm:max-w-md"
              />
            </div>
            <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--cc-accent-2)]">Season 2 Now Live</p>
            <h1 className="mt-4 text-[2.1rem] font-semibold leading-[1.18] tracking-tight">
              Cinema isn&apos;t meant<br />to be scrolled through.
            </h1>
            <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">
              CinemaCodex is a guided film curriculum with an AI companion built for people who want to truly <em>understand</em> great cinema — not just consume it.
            </p>
            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <Link href="/signup" className="flex-1"><Button className="w-full">Start Your Journey</Button></Link>
              <Link href="/demo" className="flex-1"><Button className="w-full" variant="secondary">See How It Works</Button></Link>
            </div>
            <p className="mt-3 text-center text-xs text-[var(--text-muted)]">Free to join · No credit card required</p>
          </div>
        </section>

        {/* Three pillars */}
        <section>
          <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Why CinemaCodex</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              {
                icon: '🎞',
                label: 'Curated Seasons',
                body: 'Not an algorithm. A hand-crafted curriculum across genres and eras — Horror Classics, Cult Cinema, and beyond.',
              },
              {
                icon: '🤖',
                label: 'AI Companion',
                body: 'Evidence-grounded commentary for every film. Craft notes, production context, thematic depth — sourced, never invented.',
              },
              {
                icon: '🧬',
                label: 'Cinematic DNA',
                body: 'Your taste profile evolves with every rating and reaction. The more you engage, the sharper your recommendations get.',
              },
            ].map(({ icon, label, body }) => (
              <Card key={label} className="border-[rgba(193,18,31,0.25)] text-center">
                <div className="text-3xl">{icon}</div>
                <h3 className="mt-2 text-base font-semibold">{label}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{body}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Active seasons */}
        <section>
          <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">Our Curriculum</p>
          <div className="space-y-4">
            {/* Season 1 */}
            <Card className="border-[rgba(193,18,31,0.35)]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">Horror Classics</h3>
                    <span className="rounded-full bg-[rgba(34,197,94,0.15)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-green-400">Active</span>
                  </div>
                  <p className="mt-1.5 text-sm leading-6 text-[var(--text-muted)]">
                    The definitive canon — from silent-era terrors to modern masterpieces. 16 sub-genres spanning supernatural, psychological, slasher, cosmic horror, and beyond.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {['Supernatural', 'Psychological', 'Slasher', 'Creature', 'Body Horror', 'Cosmic', 'Folk', 'Gothic'].map((genre) => (
                      <span key={genre} className="rounded bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">{genre}</span>
                    ))}
                    <span className="rounded bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">+8 more</span>
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-1">
                  <div className="text-right">
                    <span className="text-2xl font-semibold">1,680+</span>
                    <span className="ml-1 text-xs text-[var(--text-muted)]">films</span>
                  </div>
                  <div className="flex gap-2 text-[10px]">
                    <span className="text-[var(--cc-accent-2)]">Core: 400+</span>
                    <span className="text-[var(--text-muted)]">Extended: 1,280+</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Season 2 */}
            <Card className="border-[rgba(193,18,31,0.35)]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">Cult Cinema</h3>
                    <span className="rounded-full bg-[rgba(193,18,31,0.18)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--cc-accent-2)]">New</span>
                  </div>
                  <p className="mt-1.5 text-sm leading-6 text-[var(--text-muted)]">
                    Midnight movies, grindhouse oddities, and rediscovered gems. 11 sub-genres covering psychotronic cinema, video store culture, and outsider masterpieces.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {['Midnight Movies', 'Grindhouse', 'Eurocult', 'Psychotronic', 'Cult Horror', 'Outsider'].map((genre) => (
                      <span key={genre} className="rounded bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">{genre}</span>
                    ))}
                    <span className="rounded bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">+5 more</span>
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-1">
                  <div className="text-right">
                    <span className="text-2xl font-semibold">560+</span>
                    <span className="ml-1 text-xs text-[var(--text-muted)]">films</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Season 3 */}
            <Card className="border-[rgba(193,18,31,0.25)]">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold">Science Fiction</h3>
                    <span className="rounded-full bg-[rgba(255,255,255,0.08)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Coming Soon</span>
                  </div>
                  <p className="mt-1.5 text-sm leading-6 text-[var(--text-muted)]">
                    From Metropolis to Interstellar — 12 sub-genres tracing humanity&apos;s dreams and fears through atomic anxiety, space exploration, cyberpunk dystopias, and AI ethics.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {['Atomic Age', 'Space Race', 'Cyberpunk', 'AI Cinema', 'Time Travel', 'Modern Speculative'].map((genre) => (
                      <span key={genre} className="rounded bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">{genre}</span>
                    ))}
                    <span className="rounded bg-[rgba(255,255,255,0.04)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">+6 more</span>
                  </div>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-1">
                  <div className="text-right">
                    <span className="text-2xl font-semibold">1,600+</span>
                    <span className="ml-1 text-xs text-[var(--text-muted)]">films</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* Companion mode */}
        <Card>
          <h2 className="text-lg font-semibold">Companion Mode</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            Every film ships with a grounded AI companion powered by real source material — Wikipedia, press archives, critic essays. What you get is insight, not noise.
          </p>
          <ul className="mt-3 space-y-2.5 text-sm leading-6">
            {[
              ['Light Summary', 'What to know before you watch — no spoilers.'],
              ['Full Deep Dive', 'Craft, subtext, cultural context, and lasting impact.'],
              ['Production Trivia', 'Five sourced facts from behind the scenes.'],
              ['Spoiler Control', 'Choose how deep to go — clean preview, light hints, or full breakdown. You decide.'],
            ].map(([title, body]) => (
              <li key={title} className="flex gap-2.5">
                <span className="mt-0.5 shrink-0 text-[var(--cc-accent-2)]">→</span>
                <span className="text-[var(--text-muted)]"><strong className="text-[var(--text)]">{title}</strong> — {body}</span>
              </li>
            ))}
          </ul>
        </Card>

        {/* Competitors */}
        <Card>
          <h2 className="text-lg font-semibold">Not Another Watchlist App</h2>
          <div className="mt-3 space-y-3 text-sm">
            {[
              ['IMDb', 'gives you data.', 'We give you a guided education.'],
              ['Letterboxd', 'helps you log films.', 'We help you grow through them.'],
              ['JustWatch', 'shows where to stream.', 'We show you what to watch next and why it matters.'],
              ['Streaming algorithms', 'keep you on the platform.', 'We build your taste — not your dependency.'],
            ].map(([competitor, them, us]) => (
              <div key={competitor} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <span className="font-semibold text-[var(--text)]">{competitor}</span>
                <span className="text-[var(--text-muted)]">{them} <span className="text-[var(--cc-accent-2)]">{us}</span></span>
              </div>
            ))}
          </div>
        </Card>

        {/* How it works steps */}
        <section>
          <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--text-muted)]">The Experience</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              ['01', 'Calibrate', 'A short onboarding maps your horror tolerance, pacing preference, and genre familiarity.'],
              ['02', 'Get Your Batch', 'Receive 5 curated films from the active season, ranked to your evolving taste profile.'],
              ['03', 'Open Companion', 'Tap any film for sourced AI context — light teaser or full deep dive, your choice.'],
              ['04', 'Rate & React', 'Quick Poll reactions teach your Cinematic DNA what resonates with you.'],
              ['05', 'Track Progress', 'Your Journey Map shows where you stand in the curriculum and what to unlock next.'],
              ['06', 'Advance', 'Finish Season 1 and move into Cult Cinema, Sci-Fi, and seasons still being built.'],
            ].map(([num, title, body]) => (
              <Card key={num} className="border-[rgba(255,255,255,0.07)]">
                <p className="font-mono text-xs font-semibold text-[var(--cc-accent-2)]">{num}</p>
                <h3 className="mt-1 text-sm font-semibold">{title}</h3>
                <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{body}</p>
              </Card>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="rounded-2xl border border-[rgba(193,18,31,0.5)] bg-[rgba(10,10,12,0.96)] p-6 text-center shadow-[0_0_60px_rgba(155,17,30,0.12)]">
          <h2 className="text-2xl font-semibold">Ready to watch differently?</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            A curriculum built by film obsessives. Powered by evidence-grounded AI. Shaped by your taste.
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/signup"><Button className="w-full sm:w-auto sm:px-10">Start Your Journey</Button></Link>
            <Link href="/login"><Button className="w-full sm:w-auto sm:px-10" variant="secondary">Sign In</Button></Link>
          </div>
        </section>

      </main>
    </div>
  );
}
