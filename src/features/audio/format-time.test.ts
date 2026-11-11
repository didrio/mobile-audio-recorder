import { formatDuration, formatTimecode } from './format-time';

describe('formatTimecode', () => {
  it('shows minutes, seconds and tenths', () => {
    expect(formatTimecode(0)).toBe('0:00.0');
    expect(formatTimecode(7.39)).toBe('0:07.3');
    expect(formatTimecode(724)).toBe('12:04.0');
  });

  it('treats negative and invalid values as zero', () => {
    expect(formatTimecode(-3)).toBe('0:00.0');
    expect(formatTimecode(Number.NaN)).toBe('0:00.0');
  });
});

describe('formatDuration', () => {
  it('rounds to whole seconds', () => {
    expect(formatDuration(59.6)).toBe('1:00');
    expect(formatDuration(125.2)).toBe('2:05');
    expect(formatDuration(0)).toBe('0:00');
  });
});
