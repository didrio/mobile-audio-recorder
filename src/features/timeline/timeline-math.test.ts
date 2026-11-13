import {
  clampScroll,
  clampZoom,
  DEFAULT_ZOOM,
  defaultZoom,
  followScroll,
  formatRulerTime,
  hiddenLanes,
  laneScrollMax,
  MAX_ZOOM,
  maxScroll,
  minZoom,
  pageScroll,
  pointToTime,
  rulerSteps,
  timeToPoint,
  waveformGain,
  waveformLevel,
  zoomAroundPoint,
} from './timeline-math';

describe('zoom', () => {
  it('fits the whole idea when zoomed out, and caps zooming in', () => {
    expect(minZoom(400, 30)).toBe(10); // 400 pt over 30 s + 10 s tail
    expect(clampZoom(1, 400, 30)).toBe(10);
    expect(clampZoom(10_000, 400, 30)).toBe(MAX_ZOOM);
  });

  it('opens at the same scale in both orientations, or the whole idea if it fits', () => {
    expect(defaultZoom(400, 120)).toBe(DEFAULT_ZOOM);
    expect(defaultZoom(850, 120)).toBe(DEFAULT_ZOOM);
    expect(defaultZoom(600, 5)).toBe(40); // 15 s with the tail fills 600 pt
  });

  it('keeps the time under the fingers in place', () => {
    const scroll = 10;
    const zoom = 50;
    const focal = 200;
    const next = zoomAroundPoint(scroll, zoom, 100, focal);
    expect(pointToTime(focal, next, 100)).toBeCloseTo(pointToTime(focal, scroll, zoom));
  });
});

describe('scroll', () => {
  it('stops at the start and after the tail', () => {
    expect(maxScroll(400, 20, 30)).toBe(20); // 40 s of content, 20 s visible
    expect(clampScroll(-5, 400, 20, 30)).toBe(0);
    expect(clampScroll(99, 400, 20, 30)).toBe(20);
    expect(maxScroll(400, 5, 30)).toBe(0);
  });

  it('converts between time and points', () => {
    expect(timeToPoint(12, 10, 50)).toBe(100);
    expect(pointToTime(100, 10, 50)).toBe(12);
  });

  it('follows the playhead once it passes a third of the view', () => {
    expect(followScroll(0, 5, 30)).toBe(0);
    expect(followScroll(0, 13, 30)).toBe(3);
    expect(followScroll(20, 4, 30)).toBe(0);
    expect(followScroll(20, 2, 3)).toBe(1);
  });
});

describe('ruler', () => {
  it('spaces labels at least 56 pt apart and divides them evenly', () => {
    expect(rulerSteps(400)).toEqual({ label: 1, tick: 0.1 });
    expect(rulerSteps(40)).toEqual({ label: 2, tick: 0.5 });
    expect(rulerSteps(10)).toEqual({ label: 10, tick: 1 });
    expect(rulerSteps(3)).toEqual({ label: 30, tick: 5 });
  });

  it('formats labels as m:ss', () => {
    expect(formatRulerTime(0)).toBe('0:00');
    expect(formatRulerTime(65)).toBe('1:05');
    expect(formatRulerTime(600)).toBe('10:00');
  });
});

describe('waveformLevel', () => {
  it('picks the finest level when zoomed in and coarser ones when zoomed out', () => {
    expect(waveformLevel(187.5, 400, 4, 4)).toBe(0);
    expect(waveformLevel(187.5, 20, 4, 4)).toBe(1);
    expect(waveformLevel(187.5, 1, 4, 4)).toBe(3);
  });
});

describe('lanes', () => {
  it('scrolls far enough to show the last lane and the footer row', () => {
    expect(laneScrollMax(340, 8, 68, 44)).toBe(248);
    expect(laneScrollMax(340, 2, 68, 44)).toBe(0);
  });

  it('counts lanes hidden above and below the viewport', () => {
    expect(hiddenLanes(0, 340, 68, 8)).toEqual({ above: 0, below: 3 });
    expect(hiddenLanes(136, 340, 68, 8)).toEqual({ above: 2, below: 1 });
    // Half a lane showing still counts as visible.
    expect(hiddenLanes(34, 340, 68, 8)).toEqual({ above: 0, below: 2 });
    expect(hiddenLanes(0, 340, 68, 1)).toEqual({ above: 0, below: 0 });
  });

  it('pages by whole lanes within bounds', () => {
    expect(pageScroll(0, 340, 68, 1, 248)).toBe(248); // a page is 5 lanes, capped at the end
    expect(pageScroll(0, 300, 68, 1, 500)).toBe(272); // 4 whole lanes fit
    expect(pageScroll(248, 340, 68, -1, 248)).toBe(0);
    expect(pageScroll(30, 140, 68, 1, 500)).toBe(136); // lands on a lane boundary
  });
});

describe('waveformGain', () => {
  it('scales the loudest take to full height and keeps the others in proportion', () => {
    const gain = waveformGain(0.4);
    expect(0.4 * gain).toBeCloseTo(1);
    expect(0.2 * gain).toBeCloseTo(0.5);
  });

  it('never boosts near-silence more than 20×', () => {
    expect(waveformGain(0.001)).toBe(20);
    expect(waveformGain(0)).toBe(20);
    expect(waveformGain(1)).toBe(1);
  });
});
