import { spawn } from 'node:child_process';
import { constants } from 'node:os';

/** @param {import("./types.js").Options} options @param {string} executable @param {string[]} args @returns {Promise<number>} */
export async function launchHarness(options, executable, args) {
  const env = { ...process.env };
  delete env.TYPESAFE_API_KEY;
  // run accepts its complete task via arguments; do not append unclassified stdin.
  /** @type {import("node:child_process").StdioOptions} */
  const stdio = options.command === 'chat' ? 'inherit' : ['ignore', 'inherit', 'inherit'];
  const child = spawn(executable, args, { stdio, env, cwd: options.cwd });
  const onInterrupt = () => child.kill('SIGINT');
  const onTerminate = () => child.kill('SIGTERM');
  process.on('SIGINT', onInterrupt);
  process.on('SIGTERM', onTerminate);
  try {
    return await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(code ?? 128 + ((signal ? constants.signals[signal] : undefined) ?? 1)));
    });
  } finally {
    process.off('SIGINT', onInterrupt);
    process.off('SIGTERM', onTerminate);
  }
}
