// @ts-check
/* global __dirname */
// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from '@agoric/swingset-vat/tools/prepare-test-env-ava';

// eslint-disable-next-line import/no-extraneous-dependencies
import { loadBasedir, buildVatController } from '@agoric/swingset-vat';
import path from 'path';

async function main(basedir, argv) {
  const dir = path.resolve(`${__dirname}/..`, basedir);
  const config = await loadBasedir(dir);
  config.defaultManagerType = 'xs-worker';
  const controller = await buildVatController(config, argv);
  await controller.run();
  return controller.dump();
}

const expected = [
  'start test basic functionality',
  'isLive: true',
  'getAmountOf: {"brand":{},"value":1000}',
  'newPayment amount: {"brand":{},"value":1000}',
  'burned amount: {"brand":{},"value":200}',
  'claimedPayment amount: {"brand":{},"value":200}',
  'combinedPayment amount: {"brand":{},"value":600}',
];

test('test splitPayments', async t => {
  const dump = await main('basicFunctionality', ['basicFunctionality']);
  t.deepEqual(dump.log, expected);
});
