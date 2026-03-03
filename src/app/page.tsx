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
    <main className="flex flex-1 flex-col gap-4 pb-10 pt-4">
      <section className="rounded-2xl border border-[rgba(193,18,31,0.4)] bg-[radial-gradient(circle_at_20%_20%,rgba(193,18,31,0.22),transparent_60%),rgba(8,8,10,0.96)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <p className="text-xs uppercase tracking-[0.22em] text-[var(--text-muted)]">A Guided Cinematic Intelligence Platform</p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight">
          Stop Scrolling. Start Experiencing Cinema.
        </h1>
        <p className="mt-3 text-base leading-7 text-[var(--text-muted)]">
          A guided journey through genre film and powered by AI, shaped by your taste.
        </p>
        <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">
          Think Masterclass + Rotten Tomatoes + Watchlist AI in one focused mobile experience.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Link href="/signup"><Button className="w-full">Start Your Journey</Button></Link>
          <Link href="/login"><Button className="w-full" variant="secondary">Sign In</Button></Link>
          <Link href="/demo"><Button className="w-full" variant="secondary">See How It Works</Button></Link>
        </div>
      </section>

      <Card>
        <h2 className="text-xl font-semibold">Why Film Discovery Feels Broken</h2>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-muted)]">
          <li>Endless streaming paralysis with too many choices and no direction.</li>
          <li>Ratings without context, so you know scores but not what to watch for.</li>
          <li>Watchlists without progression, turning discovery into passive backlog.</li>
        </ul>
      </Card>

      <Card>
        <h2 className="text-xl font-semibold">The Solution</h2>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-muted)]">
          <li>AI-driven personalized cinematic journeys instead of random suggestions.</li>
          <li>Deep Companion Mode during viewing for context, craft notes, and spoiler tiers.</li>
          <li>Cinematic DNA that evolves from your interactions.</li>
          <li>Structured mastery progression across themes and eras.</li>
        </ul>
      </Card>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          ['Cinematic DNA', 'Multi-trait taste modeling that updates as you rate and react.'],
          ['Intelligent Recommendation Engine', 'Ranks films by your profile, novelty, and thematic fit.'],
          ['Companion Mode', 'Readable in-the-moment notes with NO_SPOILERS/LIGHT/FULL control.'],
          ['Thematic Insights', 'Find patterns in your ratings by decade, subgenre, and intensity.'],
          ['Journey Progression', 'Track mastery milestones across guided cinematic nodes.'],
          ['Feedback Loop', 'Report confusion or ideas in-app so the experience improves continuously.'],
        ].map(([title, body]) => (
          <Card className="border-[rgba(193,18,31,0.3)]" key={title}>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{body}</p>
          </Card>
        ))}
      </section>

      <Card>
        <h2 className="text-xl font-semibold">How It Differs</h2>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-muted)]">
          <li><span className="text-[var(--text)]">IMDb</span> gives data. We add guided structure and learning context.</li>
          <li><span className="text-[var(--text)]">Letterboxd</span> helps logging. We add adaptive personalization and progression.</li>
          <li><span className="text-[var(--text)]">JustWatch</span> shows availability. We add curated direction on what to watch next and why.</li>
        </ul>
      </Card>

      <Card id="demo">
        <h2 className="text-xl font-semibold">Demo Flow</h2>
        <ol className="mt-3 space-y-2 text-sm leading-6 text-[var(--text-muted)]">
          <li>1. Onboarding calibrates your initial taste profile.</li>
          <li>2. You get a focused batch of 5 recommendations.</li>
          <li>3. Quick Poll feedback tunes the next decisions.</li>
          <li>4. Cinematic DNA evolves with every meaningful interaction.</li>
          <li>5. Companion Mode supports active viewing.</li>
          <li>6. Progression tracks mastery over time.</li>
        </ol>
      </Card>

      <section className="rounded-2xl border border-[rgba(193,18,31,0.45)] bg-[rgba(10,10,12,0.96)] p-5 text-center">
        <h2 className="text-2xl font-semibold">Begin Your First Journey</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          Replace passive browsing with guided cinematic intelligence.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Link href="/signup"><Button className="w-full">Start Your Journey</Button></Link>
          <Link href="/login"><Button className="w-full" variant="secondary">Sign In</Button></Link>
        </div>
      </section>
    </main>
  );
}
