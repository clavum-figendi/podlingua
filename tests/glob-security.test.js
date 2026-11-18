import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const vendor = require.resolve('../vendor/picomatch');

test('all installed build-tool consumers resolve the security-patched matcher', () => {
  const viteRequire = createRequire(require.resolve('vite/package.json'));
  const globRequire = createRequire(viteRequire.resolve('tinyglobby'));
  const fdirRequire = createRequire(globRequire.resolve('fdir'));
  for (const consumer of [require, viteRequire, globRequire, fdirRequire]) {
    assert.equal(consumer.resolve('picomatch'), vendor);
  }
});

// Keep catastrophic regexes in a killable child: a broken guard must fail the
// test instead of freezing the Node test runner's event loop.
test('repeated extglob wildcard bodies cannot cause exponential backtracking', () => {
  for (const pattern of ['+(*)', '*(*)', '+(*a)', '*(*a)', '+(*?a)', '+(*a|b)']) {
    const child = spawnSync(process.execPath, ['-e', `
      const assert = require('node:assert/strict');
      const pm = require(${JSON.stringify(vendor)});
      const pattern = ${JSON.stringify(pattern)};
      assert.equal(pm.isMatch('a'.repeat(40) + '/!', pattern), false);
      assert.equal(pm.isMatch(pattern, pattern), true);
    `], {timeout: 2000, encoding: 'utf8'});
    assert.ifError(child.error);
    assert.equal(child.status, 0, `${pattern}: ${child.stderr}`);
  }
});

test('ordinary file globs and bounded literal extglobs retain their semantics', () => {
  const pm = require(vendor);
  for (const [pattern, yes, no] of [
    ['src/**/*.js', 'src/views/home.js', 'src/views/home.css'],
    ['*.{js,css}', 'app.css', 'app.html'],
    ['+(ab)', 'abab', 'aba'],
    ['*(foo|bar)', 'foobar', 'baz'],
    ['file.@(js|css)', 'file.js', 'file.html'],
  ]) {
    assert.equal(pm.isMatch(yes, pattern), true, pattern);
    assert.equal(pm.isMatch(no, pattern), false, pattern);
  }
});

test('bracket, quote and parser-option variations cannot hide repeated wildcards', () => {
  for (const [pattern, prefix, options] of [
    ['+([*a)', '[a', {}],
    ['*([*a)', '[a', {}],
    ['+("["*a)', '[a', {}],
    ['+([*a])', '[a]', {nobracket: true}],
    ['+(*a)', 'a', {maxExtglobRecursion: false}],
  ]) {
    const child = spawnSync(process.execPath, ['-e', `
      const assert = require('node:assert/strict');
      const pm = require(${JSON.stringify(vendor)});
      assert.equal(pm.isMatch(${JSON.stringify(prefix)}.repeat(40) + '/!',
        ${JSON.stringify(pattern)}, ${JSON.stringify(options)}), false);
    `], {timeout: 2000, encoding: 'utf8'});
    assert.ifError(child.error);
    assert.equal(child.status, 0, `${pattern}: ${child.stderr}`);
  }
});
