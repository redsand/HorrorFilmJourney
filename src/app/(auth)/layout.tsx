import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Image from 'next/image';
import '../globals.css';

export const metadata: Metadata = {
  title: 'CinemaCodex',
  description: 'Guided cinematic intelligence platform',
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
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
      <div className="min-h-dvh flex items-center justify-center px-4 py-10">
        {children}
      </div>
    </>
  );
}
