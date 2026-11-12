import type { Messages } from '@/i18n/messages/en';

export function Steps({ steps }: { steps: Messages['steps'] }) {
  return (
    <ol className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
      {steps.map((s, i) => (
        <li key={s.title} className="bg-surface p-6 sm:p-7">
          <span className="tabular font-display text-sm font-medium text-accent">{String(i + 1).padStart(2, '0')}</span>
          <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}
