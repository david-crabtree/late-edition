import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * Twenty seconds, not five.
     *
     * A handful of these tests scaffold a whole newsroom on disk and run a complete edition
     * through every stage against the offline stand-in. They take about half a second each
     * when the machine is idle — and one of them took 5,099ms against the 5,000ms default
     * while the rest of the suite ran alongside it, which is a failure that says nothing
     * about the code and costs somebody an hour working out what they broke.
     *
     * A generous ceiling still catches a genuine hang. It just stops a busy CI runner
     * reporting one that is not there.
     */
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
