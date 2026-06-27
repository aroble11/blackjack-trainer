/**
 * histogram.js — bucket a list of values into evenly spaced bins for charting.
 *
 * Pure and DOM-free, so it's unit-testable; render.js turns the bins into SVG.
 * Every value lands in exactly one bin (the maximum goes in the last bin), so
 * the bin counts always sum to the input size.
 */
export function buildHistogram(values, bucketCount = 25) {
  const n = values.length;
  if (n === 0) return { bins: [], maxCount: 0, lo: 0, hi: 0, width: 0 };

  let lo = values[0];
  let hi = values[0];
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === hi) {
    return { bins: [{ lo, hi, count: n }], maxCount: n, lo, hi, width: 0 };
  }

  const width = (hi - lo) / bucketCount;
  const bins = Array.from({ length: bucketCount }, (_, i) => ({
    lo: lo + i * width,
    hi: lo + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    let idx = Math.floor((v - lo) / width);
    if (idx < 0) idx = 0;
    if (idx >= bucketCount) idx = bucketCount - 1; // the maximum lands in the last bin
    bins[idx].count++;
  }

  let maxCount = 0;
  for (const b of bins) if (b.count > maxCount) maxCount = b.count;
  return { bins, maxCount, lo, hi, width };
}
