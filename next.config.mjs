import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // The timetable is read from disk at runtime, so ship it with the API functions.
  outputFileTracingIncludes: {
    '/api/v1/**': ['./data/metrolink.json'],
  },
};

export default withMDX(config);
