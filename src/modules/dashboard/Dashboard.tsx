export default function Dashboard() {
  return (
    <div>
      <h1 className="text-2xl font-medium tracking-tight mb-2">dashboard</h1>
      <p className="text-neutral-500 text-sm mb-8">
        a calm, unified home for your practice. module stats will live here.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'sessions this week', value: '—' },
          { label: 'intervals fluent', value: '— / 13' },
          { label: 'chords fluent', value: '— / 29' },
          { label: 'shapes & patterns drills', value: '—' },
          { label: 'song repertoire size', value: '—' },
          { label: 'logic skills complete', value: '— / 15' },
        ].map(card => (
          <div
            key={card.label}
            className="rounded-card border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-4"
          >
            <div className="text-xs text-neutral-500">{card.label}</div>
            <div className="text-xl mt-1 font-medium">{card.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
