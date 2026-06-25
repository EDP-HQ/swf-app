/** @type {import('next').NextConfig} */
module.exports = {
  transpilePackages: ['primereact', '@tremor/react'],
  eslint: {
    ignoreDuringBuilds: true
  },
  async redirects() {
    return [{ source: '/roller-monitoring', destination: '/parts-board', permanent: true }];
  }
};
