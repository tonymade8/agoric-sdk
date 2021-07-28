import { Far } from '@agoric/marshal';
import { E } from '@agoric/eventual-send';
import { makePromiseKit } from '@agoric/promise-kit';

export function buildRootObject(vatPowers) {
  const vatstore = vatPowers.vatstore;
  let counter = 0;
  // we cannot perform syscalls during startup, only during deliveries, so we
  // can't pre-initialize this
  // vatstore.set('counter', `${counter}`);
  function increment() {
    counter += 1;
    vatstore.set('counter', `${counter}`);
  }

  let nextPKR;
  function doPromise(args) {
    increment();
    args[0]
      .then(doPromise)
      .catch(err => console.log(`right doPromise err`, err));
    const oldPK = nextPKR;
    nextPKR = makePromiseKit();
    oldPK.resolve([nextPKR.promise]);
  }

  const right = Far('right', {
    doMessage(left) {
      increment();
      E(left).doMessage(right);
    },

    startPromise(args) {
      nextPKR = makePromiseKit();
      args[0]
        .then(doPromise)
        .catch(err => console.log(`right startPromise err`, err));
      return harden([nextPKR.promise]);
    },
  });
  return right;
}
