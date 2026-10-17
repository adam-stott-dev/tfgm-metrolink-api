import { generateFiles } from 'fumadocs-openapi';
import { openapi } from '../lib/openapi.ts';

// Regenerates the API reference pages in content/docs/api from openapi.json.
void generateFiles({
  input: openapi,
  output: './content/docs/api',
  per: 'operation',
  groupBy: 'tag',
  includeDescription: true,
  beforeWrite(files) {
    // stops/getDepartures.mdx -> stops/get-departures.mdx
    for (const file of files) file.path = file.path.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  },
});
