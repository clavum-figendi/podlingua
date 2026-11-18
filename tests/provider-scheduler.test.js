import test from 'node:test';
import assert from 'node:assert/strict';
import {createProviderScheduler} from '../src/provider-scheduler.js';

test('translation and lookup calls are serialized and paced across the same endpoint origin', async () => {
  let time = 0; const starts = [], sleeps = [], persisted = new Map();
  const scheduler = createProviderScheduler({now: () => time, sleep: async ms => { sleeps.push(ms); time += ms; }, read: key => persisted.get(key), write: (key, value) => persisted.set(key, value)});
  await Promise.all(Array.from({length: 4}, (_, i) => scheduler.run('https://relay.test/path/' + i, async () => { starts.push(time); }, {intervalMs: 1250})));
  assert.deepEqual(starts, [0, 1250, 2500, 3750]);
  assert.equal(sleeps.length, 3);
  const anotherTab = createProviderScheduler({now: () => time, sleep: async ms => { time += ms; }, read: key => persisted.get(key), write: (key, value) => persisted.set(key, value)});
  await anotherTab.run('https://relay.test/other', async () => { assert.equal(time, 5000); }, {intervalMs: 1250});
});

test('429 establishes a shared cooldown, sends no retry, then permits an explicit request after expiry', async () => {
  let time = 0, calls = 0;
  const scheduler = createProviderScheduler({now: () => time, sleep: async ms => { time += ms; }, read: () => null, write: () => {}});
  const limited = Object.assign(Error('fixture'), {status: 429, retryAfterSeconds: 60});
  await assert.rejects(scheduler.run('https://quota.test/v1', async () => { calls++; throw limited; }), error => error === limited);
  await assert.rejects(scheduler.run('https://quota.test/v2', async () => { calls++; }), error => error.code === 'PROVIDER_COOLDOWN');
  assert.equal(calls, 1);
  time = 60000;
  await scheduler.run('https://quota.test/v2', async () => { calls++; });
  assert.equal(calls, 2);
});

test('cancelling a queued pacing wait never sends its request', async () => {
  let entered, release;
  const waiting = new Promise(resolve => { entered = resolve; });
  const scheduler = createProviderScheduler({now: () => 0, sleep: (ms, signal) => { entered(); return new Promise((resolve, reject) => { release = resolve; signal.addEventListener('abort', () => reject(signal.reason), {once: true}); }); }, read: () => null, write: () => {}});
  await scheduler.run('https://abort.test', async () => {});
  const control = new AbortController(); let calls = 0;
  const task = scheduler.run('https://abort.test', async () => { calls++; }, {signal: control.signal});
  await waiting; control.abort();
  await assert.rejects(task, /abort/i); release();
  assert.equal(calls, 0);
});
