import { axisMatrix, fromAxes, orientationOf, toAxes } from './timeline-axis';
import {
  clampScroll,
  clampZoom,
  defaultZoom,
  followScroll,
  formatRulerTime,
  laneSize,
  MAX_ZOOM,
  maxScroll,
  minZoom,
  pointToTime,
  rulerSteps,
  timeToPoint,
  waveformLevel,
  zoomAroundPoint,
} from './timeline-math';

describe('timeline axes', () => {
  it('maps time to x in landscape and y in portrait', () => {
    expect(orientationOf(844, 390)).toBe('landscape');
    expect(orientationOf(390, 844)).toBe('portrait');
    expect(toAxes('landscape', 10, 20)).toEqual({ time: 10, cross: 20 });
    expect(toAxes('portrait', 10, 20)).toEqual({ time: 20, cross: 10 });
  });

  it('round-trips points in both orientations', () => {
    for (const orientation of ['landscape', 'portrait'] as const) {
      const { time, cross } = toAxes(orientation, 3, 7);
      expect(fromAxes(orientation, time, cross)).toEqual({ x: 3, y: 7 });
    }
  });

  it('uses a transpose matrix in portrait', () => {
    expect(axisMatrix('landscape')).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    expect(axisMatrix('portrait')).toEqual([0, 1, 0, 1, 0, 0, 0, 0, 1]);
  });
});

describe('zoom', () => {
  it('fits the whole idea when zoomed out, and caps zooming in', () => {
    expect(minZoom(400, 30)).toBe(10); // 400 pt over 30 s + 10 s tail
    expect(clampZoom(1, 400, 30)).toBe(10);
    expect(clampZoom(10_000, 400, 30)).toBe(MAX_ZOOM);
  });

  it('opens on 30 seconds, or the whole idea if it is shorter', () => {
    expect(defaultZoom(600, 120)).toBe(20);
    expect(defaultZoom(600, 5)).toBe(40);
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

describe('laneSize', () => {
  it('shares the space between tracks within limits', () => {
    expect(laneSize(300, 1)).toBe(240);
    expect(laneSize(300, 3)).toBe(100);
    expect(laneSize(300, 10)).toBe(72);
  });
});
