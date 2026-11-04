import test from 'node:test';
import assert from 'node:assert/strict';
import {syntaxOnly,pageStructure} from '../scripts/inspect-daddy.mjs';
test('public-page inspection keeps syntax but removes quoted URLs, cookies and opaque values',()=>{
  const html=`function decode(x){const token='PRIVATE_VALUE_123';return decodeURIComponent(escape(atob(x)));}
    const opaque='QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=';
    const cookie="SESSION_PRIVATE";
    source:{src:'https://cdn.example.org/live.m3u8?token=PRIVATE_URL'};`;
  const out=JSON.stringify(pageStructure(html));
  assert(out.includes('decodeURIComponent'));assert(out.includes('atob'));
  for(const secret of ['PRIVATE_VALUE_123','SESSION_PRIVATE','PRIVATE_URL','cdn.example.org','QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo='])assert(!out.includes(secret),secret);
  assert.equal(pageStructure(html).hasAtob,true);
  assert.equal(pageStructure(html).literalMediaMentions,1);
  assert(!syntaxOnly('/* secret */ // another secret\nfunction f(x){return atob(x);}').includes('secret'));
});
