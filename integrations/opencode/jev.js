import { createJevPlugin } from '../../src/opencode-plugin.js';

export default async function JevPlugin(context) {
  return createJevPlugin(context);
}
