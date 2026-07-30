import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

const BASE_PATH = '/commiq/docs';

const config = {
  output: 'export',
  distDir: 'build',
  basePath: BASE_PATH,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: BASE_PATH,
  },
};

export default withMDX(config);
