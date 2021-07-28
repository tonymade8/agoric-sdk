/* global __dirname */
import { test } from '../../tools/prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import path from 'path';
import { provideHostStorage } from '../../src/hostStorage.js';
import { initializeSwingset, makeSwingsetController } from '../../src/index.js';
import { capargsOneSlot } from '../util.js';
import { crankCounter, computronCounter } from '../../src/runPolicies.js';
async function testPolicy(t, mode) {
  const config = {
    vats: {
      left: {
        sourceSpec: path.join(__dirname, 'vat-policy-left.js'),
      },
      right: {
        sourceSpec: path.join(__dirname, 'vat-policy-right.js'),
        creationOptions: {
          enableVatstore: true,
        },
      },
    },
    defaultManagerType: 'xs-worker',
  };
  const hostStorage = provideHostStorage();
  await initializeSwingset(config, [], hostStorage);
  const c = await makeSwingsetController(hostStorage);
  c.pinVatRoot('left');
  const rightKref = c.pinVatRoot('right');
  const rightID = c.vatNameToID('right');
  const ckey = `${rightID}.vs.vvs.counter`;
  t.teardown(c.shutdown);

  let cycleLength;
  if (mode === 'message') {
    // The 'message' mode sends doMessage() to left, which makes left send
    // doMessage() to right, which makes right send doMessage() to left, etc.
    // This uses four cranks per cycle, since each doMessage() also has a
    // return promise that must be resolved.
    const args = capargsOneSlot(rightKref);
    c.queueToVatRoot('left', 'doMessage', args);
    // The counter will be first written (to 1) on the second call to
    // c.step(). We perform 5 c.steps now, so the counter will have just
    // incremented to 2.
    // NA,1,1,1
    // 2,2,2,2
    // 3,3,3,3
    await c.step();
    await c.step();
    await c.step();
    await c.step();
    await c.step();
    cycleLength = 4;
  } else if (mode === 'resolution') {
    // This triggers a back-and-forth cycle of promise resolution, which uses
    // two cranks per cycle. The setup takes three cranks.
    const args = capargsOneSlot(rightKref);
    c.queueToVatRoot('left', 'startPromise', args);
    // The first counter write occurs on the fourth call to c.step(), so we
    // do 6 now, so the counter will have just incremented to 2.
    // NA
    // NA,NA
    // 1,1
    // 2,2
    // 3,3
    await c.step();
    await c.step();
    await c.step();
    await c.step();
    await c.step();
    await c.step();
    cycleLength = 2;
  } else {
    throw Error(`unknown mode ${mode}`);
  }

  function getCounter() {
    return parseInt(hostStorage.kvStore.get(ckey), 10);
  }

  let expectedCounter = 2;
  for (let i = 0; i < 5; i += 1) {
    const policy = crankCounter(cycleLength * 3, 0);
    expectedCounter += 3;
    // eslint-disable-next-line no-await-in-loop
    const more = await c.run(policy);
    console.log(`${i} counter: ${getCounter()}`);
    t.truthy(more);
    if (!more) {
      t.fail('vat was supposed to run forever');
      break;
    }
    t.is(getCounter(), expectedCounter);
  }


}

test('run policy - cranks - messages', t => testPolicy(t, 'message'));
test('run policy - cranks - resolutions', t => testPolicy(t, 'resolution'));
