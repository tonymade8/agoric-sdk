/* global HandledPromise */

import { makeCapTP } from '@agoric/captp';
import { Far } from '@agoric/marshal';
import { assert, details as X } from '@agoric/assert';

export function buildRootDeviceNode(tools) {
  const { SO, getDeviceState, setDeviceState, endowments } = tools;
  const restart = getDeviceState();

  let registeredReceiver = restart && restart.registeredReceiver;

  const senderPs = {};
  // Take a shallow copy so that these are not frozen.
  const connectedMods = restart ? [...restart.connectedMods] : [];
  const nextEpochs = restart ? [...restart.nextEpochs] : [];
  const connectedState = restart ? [...restart.connectedState] : [];

  function saveState() {
    setDeviceState(
      harden({
        registeredReceiver,
        // Take a shallow copy so that these are not frozen.
        nextEpochs: [...nextEpochs],
        connectedMods: [...connectedMods],
        connectedState: [...connectedState],
      }),
    );
  }
  // Register our first state.
  saveState();

  function register(mod, index) {
    if (connectedMods[index] === undefined) {
      connectedMods[index] = mod;
    }
    if (connectedMods[index] !== mod) {
      throw TypeError(
        `Index ${index} is already allocated to ${connectedMods[index]}, not ${mod}`,
      );
    }
    const epoch = nextEpochs[index] || 0;
    nextEpochs[index] = epoch + 1;
    saveState();
  }

  /**
   * Load a module and connect to it.
   *
   * @param {string} mod module with an exported `bootPlugin(state = undefined)`
   * @param {number} [index=connectedMods.length] the module instance index
   * @param {number} epoch TODO
   * @returns {(obj: Record<string, any>) => void} send a message to the module
   */
  async function createConnection(mod, index, epoch) {
    try {
      console.log('+endowments.import', mod);
      const modNS = await endowments.import(mod);
      console.log('-endowments.import', mod);
      const receiver = obj => {
        // console.info('receiver', index, obj);

        // We need to run the kernel after the send-only.
        endowments.queueThunkForKernel(() =>
          SO(registeredReceiver).dispatch(index, obj),
        );
      };
      // Create a bootstrap reference from the module.
      const bootstrap = modNS.bootPlugin(
        harden({
          getState() {
            return connectedState[index];
          },
          setState(state) {
            return new HandledPromise(resolve => {
              connectedState[index] = state;
              endowments.queueThunkForKernel(() => {
                // TODO: This is not a synchronous call.
                // We need something akin to read-write separation
                // to get the benefits of both sync and async.
                saveState();
                resolve();
              });
            });
          },
        }),
      );

      // Establish a CapTP connection.
      const { dispatch } = makeCapTP(mod, receiver, bootstrap, { epoch });

      return dispatch;
    } catch (e) {
      console.error(`Cannot connect to ${mod}:`, e);
      return `${(e && e.stack) || e}`;
    }
  }

  /**
   * Load a module and connect to it.
   *
   * @param {string} mod module with an exported `bootPlugin(state = undefined)`
   * @param {number} [index=connectedMods.length] the module instance index
   * @returns {(obj: Record<string, any>) => void} send a message to the module
   */
  function connect(mod, index = connectedMods.length) {
    const epoch = register(mod, index);
    if (senderPs[index] === undefined) {
      // Lazily create a fresh sender.
      senderPs[index] = createConnection(mod, index, epoch);
      senderPs[index].catch(e => {
        console.error(e);
      });
    }
    return index;
  }

  function send(index, obj) {
    const mod = connectedMods[index];
    // console.info('send', index, obj, mod);
    assert(mod, X`No module associated with ${index}`, TypeError);
    if (!senderPs[index]) {
      // Lazily create a fresh sender.
      connect(mod, index);
      // senderPs populated as a side-effect of connect.
    }
    // Now actually send.
    senderPs[index].then(sender => sender(obj)).catch(e => {
      console.error(e);
    });
  }

  endowments.registerResetter(() => {
    connectedMods.forEach((mod, index) => {
      if (mod) {
        // console.info('Startup resetting', index, mod, nextEpochs[index]);
        SO(registeredReceiver).reset(index, nextEpochs[index]);
      }
    });
  });

  return Far('root', {
    getPluginDir() {
      return endowments.getPluginDir();
    },
    connect,
    send,
    registerReceiver(receiver) {
      assert(!registeredReceiver, X`registered receiver already set`);
      registeredReceiver = receiver;
      saveState();
    },
  });
}
