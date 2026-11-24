// Stand-in for the server functions (src/server/server.ts), used by tests. It gives canned answers; a test that needs
// the rows the server would now hold seeds them into FakeRemote from the answer, so no server rule is copied here
// (the SQL checks in src/tests/db prove those).
import { ServerError, useServerAdapter, type ServerAdapter, type ServerReason } from '@/server/server'

type Answer = unknown | ((args: Record<string, unknown>) => unknown)

export class FakeServer implements ServerAdapter {
  isOnline = true
  readonly calls: { fn: string; args: Record<string, unknown> }[] = []
  /** What each function answers: a value, or a function of its arguments (which may seed FakeRemote first). */
  readonly answers: Record<string, Answer> = {}
  /** Functions that fail, and why. */
  readonly fails: Record<string, ServerReason> = {}

  online() {
    return this.isOnline
  }

  async call(fn: string, args: Record<string, unknown>) {
    this.calls.push({ fn, args })
    const why = this.fails[fn]
    if (why) throw new ServerError(why, `${fn}: ${why}`)
    const answer = this.answers[fn]
    return typeof answer === 'function' ? await (answer as (a: Record<string, unknown>) => unknown)(args) : (answer ?? null)
  }

  /** Send every server call here until the returned function is called. */
  use(): () => void {
    return useServerAdapter(this)
  }
}
