import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLink, validDestination } from '../lib/links.mjs';
test('active, paused, absent and malformed codes', async () => {
  assert.deepEqual(await resolveLink('A001'), {status:307,destination:'https://example.com/'});
  assert.equal((await resolveLink('A002')).status,410);
  assert.equal((await resolveLink('MISSING')).status,404);
  assert.equal((await resolveLink('../A001')).status,404);
});
test('unsafe destinations rejected', async () => {
  for(const url of ['javascript:alert(1)','data:text/html,test','/relative','https://user:pass@example.com']) assert.equal(validDestination(url),false);
  assert.equal((await resolveLink('A003',{findByCode:async()=>({active:true,destination:'javascript:alert(1)'})})).status,503);
});
test('destination changes behind the same code', async () => {
  let destination = 'https://example.com/first';
  const repository = {findByCode:async()=>({active:true,destination})};
  assert.equal((await resolveLink('A001',repository)).destination,destination);
  destination = 'https://example.com/second';
  assert.equal((await resolveLink('A001',repository)).destination,destination);
});
