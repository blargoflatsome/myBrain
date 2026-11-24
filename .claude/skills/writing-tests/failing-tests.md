# When a test fails or flakes

Treat a failing test as a bug report until a log proves otherwise. Every "flake" looked into here so far was a real
bug: a Calendar tap read a list that hadn't arrived yet, and the editor swallowed Escape. "Passes alone, fails in the
full run" usually means a race that the full run's load exposes. Guessing at causes and rerunning the full suite cost
75 minutes on 2026-11-24. Logging found each cause in minutes.

## Steps

1. **Reproduce in a tight loop**: just that test, on just that device, many times, and note how often it fails:
   `npx playwright test <file>:<line> --project=<device> --repeat-each=20`. Save `npm run test:all` for the end.
2. **Compare with main**: does main fail too? Commit or `git stash`, `git checkout main`, run the same loop, then
   switch back. Use this checkout, not a worktree (on Windows, removing a worktree deletes through a `node_modules`
   junction, and `npm ci` in a fresh one takes minutes).
3. **Instrument before changing code.** Add `console.log` lines to the app code for the state in question: what a
   list holds and when it arrived, which element has focus, whether an event was `defaultPrevented`. Run the loop with
   `PW_LOG=1` (`src/tests/e2e/support/debug.ts` prints page logs with millisecond stamps). A failed test keeps its
   trace in `test-results/` (`npx playwright show-trace <trace.zip>`). Change code only once the log shows the cause.
   Until then the cause is a guess.
4. **Make the test hit the cause every run**, so it goes red before the fix and green after: press Escape from the
   writing itself, or tap as soon as the item shows. Then run the loop with `--repeat-each=40`.
5. **Clean up as you go**: undo each experiment before trying the next, and remove the debug logs and any temporary
   spec. A comment names a cause only after a log proved it.

Done when the log names the cause, the test went red on it before the fix, and 40 repeats pass on that device.

## Causes seen here

- A click handler reads a live list (`useRows`) that may not have arrived yet. Read the row at that moment with
  `findRow` / `readRows` (CODING_STANDARDS "Reading rows on screens").
- A library cancels a key or event before the window hears it (ProseMirror and Escape).
- A fixed wait in a test (`waitForTimeout`, `setTimeout` sleeps): on a busy machine it's too short. Lint blocks new
  ones. Wait for the result instead.
