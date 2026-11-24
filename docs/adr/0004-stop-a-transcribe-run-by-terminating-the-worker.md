# 0004 — Stop a transcribe run by terminating the worker

Date: 2026-11-24
Status: accepted

## Context

The spec asks that "Cancel" stops a transcribe run within 2 seconds. The first
worker contract in the spec had a `cancel` message. `@huggingface/transformers`
4.3.2 has no way to stop a run that is in progress, so a worker that is busy with a
chunk cannot act on a message. Two options existed: wait for the end of the
current chunk and then stop, or terminate the worker.

## Decision

The client stops a run by terminating the worker. The next run starts a new worker
and loads the speech model again from the browser cache. The worker contract has
no `cancel` message.

## Consequences

- "Cancel" takes effect at once, on every device.
- A run after a cancel pays the load time of the speech model again (about 1 second
  from the cache in the recorded runs). It downloads nothing.
- Messages from a terminated run cannot arrive, so the client needs no check for
  them beyond the run id.
- If the library adds a way to stop a run, a `cancel` message can return and this
  record is superseded.
