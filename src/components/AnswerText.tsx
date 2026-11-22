/**
 * Shows a model answer as plain text, never HTML, so it cannot inject markup. Lines that start with a bullet
 * ("• " or "- ") become a real list, so screen readers announce "list, 3 items" instead of reading symbols.
 */
const BULLET = /^\s*(?:•|-)\s+/;

type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] };

/** Models sometimes put bullets on one line ("Text. • A. • B."); start a new line at each inline bullet. */
const INLINE_BULLET = /\s+•\s+/g;

export function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.replace(INLINE_BULLET, '\n• ').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const last = blocks[blocks.length - 1];
    if (BULLET.test(line)) {
      const item = line.replace(BULLET, '');
      if (last?.kind === 'ul') last.items.push(item);
      else blocks.push({ kind: 'ul', items: [item] });
    } else {
      blocks.push({ kind: 'p', text: line });
    }
  }
  return blocks;
}

export function AnswerText({ text }: { text: string }) {
  return (
    <div className="answer-text">
      {toBlocks(text).map((b, i) =>
        b.kind === 'p' ? (
          <p key={i}>{b.text}</p>
        ) : (
          <ul key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
