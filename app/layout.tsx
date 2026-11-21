import type { Metadata } from 'next';
import { Cairo, IBM_Plex_Sans_Arabic, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'سينا ستوديو — محرر الفيديو الاحترافي 4K',
  description:
    'محرر فيديو متكامل يدعم جميع الصيغ مع انتقالات انيميشن احترافية، طبقات ونصوص وأشكال، إزالة الضوضاء الكاملة، تحويل الفيديو إلى صوت MP3 و WAV، والتصدير حتى 4K.',
  openGraph: {
    title: 'سينا ستوديو — محرر الفيديو الاحترافي 4K',
    description:
      'محرر فيديو متكامل يدعم جميع الصيغ مع انتقالات انيميشن احترافية، إزالة الضوضاء، استخراج الصوت، وتصدير 4K.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'سينا ستوديو — محرر الفيديو الاحترافي 4K',
    description:
      'محرر فيديو متكامل يدعم جميع الصيغ مع انتقالات انيميشن احترافية، إزالة الضوضاء، استخراج الصوت، وتصدير 4K.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${cairo.variable} ${ibmPlexArabic.variable} ${jetbrainsMono.variable} dark`}
    >
      <body
        suppressHydrationWarning
        className="bg-[#0A0D12] text-slate-100 font-sans antialiased selection:bg-amber-500/30 selection:text-amber-200 overflow-x-hidden"
      >
        {children}
      </body>
    </html>
  );
}
