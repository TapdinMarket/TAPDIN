import type { Metadata } from 'next';
import { Container, Eyebrow } from '@/components/ui';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.privacy.title };
}

export default async function PrivacyPage() {
  const { m } = await getI18n();
  const t = m.privacy;
  return (
    <Container className="max-w-3xl py-14 lg:py-20">
      <Eyebrow>{m.footer.privacy}</Eyebrow>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">{t.title}</h1>
      <p className="mt-5 text-lg leading-relaxed text-ink-soft">{t.intro}</p>
      <ol className="mt-12 divide-y divide-line border-y border-line">
        {t.sections.map((s, i) => (
          <li key={s.t} className="grid gap-2 py-6 sm:grid-cols-[3rem_1fr]">
            <span className="tabular text-[12px] font-medium tracking-[0.2em] text-accent">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <h2 className="text-lg font-semibold">{s.t}</h2>
              <p className="mt-2 leading-relaxed text-ink-soft">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>
    </Container>
  );
}
