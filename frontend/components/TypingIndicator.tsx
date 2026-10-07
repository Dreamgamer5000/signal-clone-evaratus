'use client';

export function TypingIndicator({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const label =
    names.length === 1
      ? `${names[0]} is typing…`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing…`
        : `${names[0]} and ${names.length - 1} others are typing…`;
  return (
    <div className="px-4 pb-1 flex justify-start">
      <div className="bg-gray-05 text-gray-60 text-sm rounded-2xl rounded-bl-md px-3 py-1.5 inline-flex items-center gap-2">
        <span className="flex gap-0.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-gray-45 animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </span>
        {label}
      </div>
    </div>
  );
}
