"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

/**
 * Paper Atlas scroll-film (Lane A: pure-code GSAP + Lenis).
 * One continuous shot: desk → seal → flight → landing → proof,
 * then resolves into the demo, code, docs and footer.
 * Content is server-rendered and visible by default; motion only
 * enhances (and fully stands down for prefers-reduced-motion).
 */
export default function LandingFilm() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ?jump=N screenshot harness: settle synchronously at the target with
    // native scroll (no Lenis smoothing) so headless captures are deterministic.
    const jumpParam = new URLSearchParams(window.location.search).get("jump");
    const jumpTo = jumpParam === null ? null : Number(jumpParam);
    const jumpMode = jumpTo !== null && !Number.isNaN(jumpTo);
    if (jumpMode) window.scrollTo(0, jumpTo);

    let lenis: Lenis | null = null;
    const tick = (time: number) => lenis?.raf(time * 1000);
    if (!reduced && !jumpMode) {
      lenis = new Lenis({ lerp: 0.09 });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }

    const ctx = gsap.context(() => {
      if (reduced) return;
      // Char-split hero reveal.
      document.querySelectorAll("[data-split]").forEach((el) => {
        const text = el.textContent ?? "";
        el.textContent = "";
        // Word wrappers keep line-breaking between words (never mid-word);
        // only the inner char spans animate.
        for (const word of text.split(" ")) {
          const w = document.createElement("span");
          w.className = "split-word inline-block whitespace-nowrap";
          for (const ch of word) {
            const span = document.createElement("span");
            span.className = "split-ch inline-block will-change-transform";
            span.textContent = ch;
            w.appendChild(span);
          }
          el.appendChild(w);
          el.appendChild(document.createTextNode(" "));
        }
      });
      if (!jumpMode) {
        gsap.from("[data-split] .split-ch", {
          yPercent: 110,
          opacity: 0,
          rotate: 4,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.018,
          delay: 0.15,
        });
        gsap.from("[data-hero-fade]", { y: 24, opacity: 0, duration: 1, ease: "power2.out", stagger: 0.12, delay: 0.5 });
      }

      // Pinned scenes first (ordering law), ambient after.
      gsap.set("[data-hero-bg]", { scale: 1.25 });
      gsap.to("[data-hero-bg]", {
        yPercent: 10,
        ease: "none",
        scrollTrigger: { trigger: "[data-chapter='desk']", start: "top top", end: "bottom top", scrub: true },
      });

      gsap.fromTo(
        "[data-seal-bg]",
        { scale: 1.18 },
        {
          scale: 1,
          ease: "none",
          scrollTrigger: { trigger: "[data-chapter='seal']", start: "top bottom", end: "bottom top", scrub: true },
        },
      );
      gsap.from("[data-stamp]", {
        scale: 2.6,
        rotate: -24,
        opacity: 0,
        duration: 0.7,
        ease: "power4.in",
        scrollTrigger: { trigger: "[data-stamp]", start: "top 72%", toggleActions: "play none none reverse" },
      });

      const flight = gsap.timeline({
        scrollTrigger: {
          trigger: "[data-chapter='flight']",
          start: "top top",
          end: "+=280%",
          pin: true,
          scrub: 0.6,
        },
      });
      flight.fromTo("[data-route]", { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: "none", duration: 3 }, 0);
      flight.to(
        "[data-plane]",
        {
          ease: "none",
          duration: 3,
          motionPath: { path: "[data-route]", align: "[data-route]", alignOrigin: [0.5, 0.5], autoRotate: true },
        },
        0,
      );
      document.querySelectorAll("[data-waypoint]").forEach((el, i) => {
        flight.fromTo(
          el,
          { opacity: 0, y: 40 },
          { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" },
          0.3 + i * 0.9,
        );
        if (i < 2) flight.to(el, { opacity: 0, y: -30, duration: 0.4, ease: "power2.in" }, 1.0 + i * 0.9);
      });

      gsap.from("[data-beat]", {
        y: 60,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out",
        stagger: 0.15,
        scrollTrigger: { trigger: "[data-beats]", start: "top 70%", toggleActions: "play none none reverse" },
      });

      document.querySelectorAll("[data-count]").forEach((el) => {
        const target = Number(el.getAttribute("data-count"));
        const obj = { value: 0 };
        gsap.to(obj, {
          value: target,
          duration: 1.4,
          ease: "power2.out",
          snap: { value: 1 },
          onUpdate: () => {
            el.textContent = String(Math.round(obj.value));
          },
          scrollTrigger: { trigger: el, start: "top 82%", toggleActions: "play none none reverse" },
        });
      });

      gsap.from("[data-rise]", {
        y: 48,
        opacity: 0,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.1,
        scrollTrigger: { trigger: "[data-after]", start: "top 78%", toggleActions: "play none none reverse" },
      });
    }, root);

    if (jumpMode && jumpTo !== null) {
      window.scrollTo(0, jumpTo);
      ScrollTrigger.refresh();
      // Late font/image layout shifts move trigger positions; re-measure once settled.
      document.fonts?.ready.then(() => {
        window.scrollTo(0, jumpTo);
        ScrollTrigger.refresh();
      });
    }
    (window as unknown as { __ready?: boolean }).__ready = true;

    return () => {
      ctx.revert();
      gsap.ticker.remove(tick);
      lenis?.destroy();
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  return (
    <div ref={root} className="bg-[#f3ede2] font-body text-[#1c1917]">
      {/* ── Chapter 1 · The Desk ─────────────────────────────── */}
      <section data-chapter="desk" className="relative flex min-h-screen flex-col overflow-hidden">
        <Image
          data-hero-bg
          src="/landing/desk.webp"
          alt=""
          aria-hidden
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[#1c1917]/62" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-24 text-[#f7f2e7]">
          <p data-hero-fade className="text-sm tracking-[0.3em] text-[#e8c87a]">
            MAILMAAN · EMAIL RUNTIME FOR AI-BUILT APPS
          </p>
          <h1 className="mt-6 max-w-4xl font-display text-5xl leading-[1.04] font-medium tracking-tight text-balance sm:text-7xl">
            <span className="block overflow-hidden pb-1">
              <span data-split className="block">
                Every app has
              </span>
            </span>
            <span className="block overflow-hidden pb-2">
              <span data-split className="block italic">
                something to say.
              </span>
            </span>
          </h1>
          <p data-hero-fade className="mt-6 max-w-xl text-lg leading-8 text-[#f7f2e7]/85">
            Mailmaan turns your app&rsquo;s moments — signups, orders, shipments —
            into beautiful, brand-true emails with timelines you can trust.
          </p>
          <div data-hero-fade className="mt-9 flex flex-wrap gap-3">
            <a
              href="/demo/soko"
              className="rounded-md bg-[#e8c87a] px-6 py-3 text-sm font-semibold text-[#1c1917] transition-colors hover:bg-[#f2d894]"
            >
              Fly the live demo
            </a>
            <Link
              href="/docs"
              className="rounded-md border border-[#f7f2e7]/40 px-6 py-3 text-sm font-semibold text-[#f7f2e7] transition-colors hover:bg-[#f7f2e7]/10"
            >
              Read the docs
            </Link>
          </div>
        </div>
        <div data-hero-fade className="relative mx-auto w-full max-w-6xl px-6 pb-10">
          <p className="text-xs tracking-[0.3em] text-[#f7f2e7]/60">SCROLL — THE LETTER IS LEAVING</p>
        </div>
      </section>

      {/* ── Chapter 2 · The Seal ─────────────────────────────── */}
      <section data-chapter="seal" className="relative flex min-h-[130vh] flex-col overflow-hidden">
        <Image
          data-seal-bg
          src="/landing/envelope.webp"
          alt="A sealed kraft envelope"
          fill
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#1c1917]/70 via-transparent to-[#1c1917]/80" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-32">
          <div className="max-w-xl">
            <p className="text-sm tracking-[0.3em] text-[#e8c87a]">CHAPTER ONE · THE TEMPLATE</p>
            <h2 className="mt-4 font-display text-4xl leading-tight font-medium text-[#f7f2e7] sm:text-6xl">
              Sealed in your brand.
            </h2>
            <p className="mt-5 text-lg leading-8 text-[#f7f2e7]/85">
              Describe the email. The AI drafts it in your voice and colors —
              you review, you publish, once. Every send after that reuses it.
            </p>
          </div>
          <div data-stamp className="pointer-events-none mt-10 h-40 w-40 sm:h-52 sm:w-52" aria-hidden>
            <svg viewBox="0 0 200 200" className="h-full w-full -rotate-12">
              <defs>
                <path id="stamp-circle" d="M100,100 m-72,0 a72,72 0 1,1 144,0 a72,72 0 1,1 -144,0" />
              </defs>
              <circle cx="100" cy="100" r="94" fill="none" stroke="#b3402a" strokeWidth="5" />
              <circle cx="100" cy="100" r="58" fill="none" stroke="#b3402a" strokeWidth="2" />
              <text fill="#b3402a" fontSize="16.5" fontWeight="700" letterSpacing="3.5">
                <textPath href="#stamp-circle">AI-DRAFTED · HUMAN-SEALED ·</textPath>
              </text>
              <text x="100" y="112" textAnchor="middle" fill="#b3402a" fontSize="34" fontWeight="800">
                M
              </text>
            </svg>
          </div>
        </div>
      </section>

      {/* ── Chapter 3 · The Flight (pinned) ──────────────────── */}
      <section data-chapter="flight" className="relative flex h-screen flex-col overflow-hidden">
        <Image
          src="/landing/rooftops.webp"
          alt="A paper plane crossing Nairobi rooftops at dusk"
          fill
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[#1c1917]/25" />
        <svg
          viewBox="0 0 1200 700"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          <path
            data-route
            d="M -40 560 C 240 560, 300 420, 520 420 S 820 300, 920 220 S 1080 120, 1260 100"
            fill="none"
            stroke="#f7f2e7"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray="1"
            pathLength={1}
            style={{ strokeDashoffset: 1 }}
          />
          <g data-plane>
            <path d="M0,-14 L10,10 L0,5 L-10,10 Z" fill="#f7f2e7" stroke="#1c1917" strokeWidth="1.5" />
          </g>
        </svg>
        <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6">
          <p className="text-sm tracking-[0.3em] text-[#f7f2e7]">CHAPTER TWO · THE SEND</p>
          <div className="relative mt-6 h-56">
            {[
              { n: "01", title: "Your app fires an event", body: "user.signed_up · order.paid — one POST, one stable id." },
              { n: "02", title: "A workflow maps it", body: "Recipient path plus variables fill the sealed template." },
              { n: "03", title: "It sends from your mailbox", body: "Your SMTP, your from-name. Never a shared account." },
            ].map((w) => (
              <div key={w.n} data-waypoint className="absolute inset-x-0 top-0 max-w-lg">
                <p className="font-display text-7xl font-semibold text-[#f7f2e7]/25">{w.n}</p>
                <h3 className="-mt-4 font-display text-3xl font-medium text-[#f7f2e7] sm:text-5xl">{w.title}</h3>
                <p className="mt-3 font-mono text-sm text-[#f7f2e7]/90">{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Chapter 4 · The Landing ──────────────────────────── */}
      <section data-chapter="landing" className="relative flex min-h-screen flex-col overflow-hidden">
        <Image
          src="/landing/inboxglow.webp"
          alt="A letter sliding through a glowing mailbox slot"
          fill
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[#1c1917]/55" />
        <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-32">
          <p className="text-sm tracking-[0.3em] text-[#e8c87a]">CHAPTER THREE · THE PROOF</p>
          <h2 className="mt-4 max-w-2xl font-display text-4xl leading-tight font-medium text-[#f7f2e7] sm:text-6xl">
            Lands where it matters.
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-8 text-[#f7f2e7]/85">
            No fake delivered. Status is synced back from the provider and
            stamped on a timeline you can inspect — and diagnose from.
          </p>
          <div data-beats className="mt-10 flex max-w-2xl flex-col gap-3 sm:flex-row">
            {[
              { beat: "queued", note: "rendered + stored" },
              { beat: "accepted", note: "provider confirmed" },
              { beat: "timeline", note: "evidence, forever" },
            ].map((b) => (
              <div
                key={b.beat}
                data-beat
                className="flex-1 rounded-md border border-[#f7f2e7]/25 bg-[#1c1917]/60 px-5 py-4 backdrop-blur-sm"
              >
                <p className="font-mono text-sm font-bold tracking-widest text-[#e8c87a]">{b.beat}</p>
                <p className="mt-1 text-sm text-[#f7f2e7]/80">{b.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Chapter 5 · Proof ────────────────────────────────── */}
      <section className="border-y-4 border-double border-[#1c1917]/20 bg-[#f3ede2] px-6 py-24">
        <div className="mx-auto grid w-full max-w-6xl gap-10 sm:grid-cols-3">
          {[
            { value: 6, suffix: "", label: "lifecycle emails, one Soko order" },
            { value: 1, suffix: "", label: "AI brief per template, reused forever" },
            { value: 0, suffix: "", label: "fake statuses. Evidence or nothing." },
          ].map((stat) => (
            <div key={stat.label} className="text-center sm:text-left">
              <p className="font-display text-7xl font-semibold text-[#1c1917]">
                <span data-count={stat.value}>0</span>
                {stat.suffix}
              </p>
              <p className="mt-2 text-[#1c1917]/70">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── After-film ───────────────────────────────────────── */}
      <div data-after className="bg-[#faf7f0] px-6 py-24 text-[#1c1917]">
        <div className="mx-auto w-full max-w-6xl">
          <div data-rise className="overflow-hidden rounded-lg bg-[#1a7f37] p-8 text-white sm:p-12">
            <p className="text-sm tracking-[0.3em] text-emerald-100">LIVE DEMO · SOKO STORE</p>
            <h2 className="mt-3 max-w-2xl font-display text-3xl leading-tight font-medium sm:text-5xl">
              Buy coffee. Get six emails. Brief the AI yourself.
            </h2>
            <p className="mt-4 max-w-xl leading-7 text-emerald-50/90">
              A real storefront on this deployment: checkout fires events, the
              tracker walks a five-minute delivery life, and the finale is
              yours to write with the AI.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="/demo/soko"
                className="rounded-md bg-white px-6 py-3 text-sm font-semibold text-[#1a7f37] transition-colors hover:bg-emerald-50"
              >
                Open the Soko demo
              </a>
              <Link
                href="/docs/soko-demo"
                className="rounded-md border border-white/50 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                How the demo is built
              </Link>
            </div>
          </div>

          <div className="mt-14 grid gap-10 lg:grid-cols-2">
            <div data-rise>
              <h3 className="font-display text-3xl font-medium">Five lines to your first email.</h3>
              <p className="mt-3 leading-7 text-[#1c1917]/70">
                The whole integration contract: fire an event, carry the
                variables, reuse the template. Agents get the same power
                through seven MCP tools.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/docs/developer-guide"
                  className="rounded-md bg-[#1c1917] px-5 py-2.5 text-sm font-semibold text-[#f7f2e7] transition-colors hover:bg-black"
                >
                  Developer guide
                </Link>
                <Link
                  href="/docs/api"
                  className="rounded-md border border-[#1c1917]/30 px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-[#1c1917]/5"
                >
                  API reference
                </Link>
                <a
                  href="/dashboard"
                  className="rounded-md border border-[#1c1917]/30 px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-[#1c1917]/5"
                >
                  Open dashboard
                </a>
              </div>
            </div>
            <pre
              data-rise
              className="overflow-x-auto rounded-lg bg-[#1c1917] p-5 font-mono text-[13px] leading-6 text-[#f7f2e7]"
            >
{`await mailmaan.trackEvent({
  id: \`order/\${order.id}\`,
  name: "order.paid",
  data: { customerEmail, firstName,
          orderId, total, currency },
});
// → receipt rendered, sent, timeline kept.`}
            </pre>
          </div>

          <footer className="mt-20 flex flex-col gap-3 border-t border-[#1c1917]/15 pt-6 text-sm text-[#1c1917]/60 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-display text-lg text-[#1c1917]">Mailmaan</p>
            <p>Email runtime for AI-built applications · built for the hackathon, honest by design.</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
